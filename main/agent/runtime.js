const { MAX_CONTENT_LENGTH } = require('./sessions');
const { RISK } = require('./types');
const { classifyCommand, classifySftpDelete, decide } = require('./policy');

function normalizePayload(value, maxLen = MAX_CONTENT_LENGTH) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (text.length <= maxLen) return { text, truncated: false };
  return { text: text.slice(0, maxLen), truncated: true };
}

function normalizeToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return undefined;
  const serialized = JSON.stringify(toolCalls);
  if (serialized.length <= MAX_CONTENT_LENGTH) return toolCalls;
  return toolCalls.map((tc) => ({
    id: tc.id,
    type: tc.type,
    function: {
      name: tc.function?.name,
      arguments: String(tc.function?.arguments || '').slice(0, 2000),
    },
    truncated: true,
  }));
}

function hasSshTarget(targets) {
  return (targets || []).some((t) => t.type === 'ssh' && t.serverId);
}

function hasK8sTarget(targets) {
  return (targets || []).some((t) => t.type === 'k8s' && t.clusterId);
}

/** When SSH is already bound, hide list/connect so the model cannot scan all hosts. */
function filterToolsForTargets(tools, targets) {
  const list = Array.isArray(tools) ? tools : [];
  if (!hasSshTarget(targets)) return list;
  return list.filter((t) => t.name !== 'server.list' && t.name !== 'server.connect');
}

function formatBoundTargets(targets, connections = []) {
  const lines = [];
  const ssh = (targets || []).find((t) => t.type === 'ssh' && t.serverId);
  if (ssh) {
    const conn = (connections || []).find((c) => c.id === ssh.serverId);
    const label = conn?.label || conn?.host || ssh.serverId;
    const host = conn?.host ? ` (${conn.host})` : '';
    lines.push(
      `- SSH 已绑定：「${label}」${host}，serverId=${ssh.serverId}`
    );
    lines.push('  请直接对该主机执行工具；禁止列出全部服务器，禁止让用户从服务器清单中再选一台。');
    lines.push('  若仅缺少服务名、路径、命名空间等细节，可用 agent_ask_user 只追问该细节。');
  }
  const k8s = (targets || []).find((t) => t.type === 'k8s' && t.clusterId);
  if (k8s) {
    const ns = k8s.namespace ? `，namespace=${k8s.namespace}` : '';
    lines.push(`- K8s 已绑定：clusterId=${k8s.clusterId}${ns}`);
    lines.push('  请直接对该集群执行工具；不要再让用户选择集群。');
  }
  return lines;
}

function toolsToOpenAi(tools) {
  const { toApiToolName } = require('./tools/registry');
  return (tools || []).map((t) => ({
    type: 'function',
    function: {
      name: toApiToolName(t.name),
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

function buildSystemPrompt(tools, skills, binding) {
  const { toApiToolName } = require('./tools/registry');
  const { getCatalog } = require('./skills/catalog');
  const skillList = Array.isArray(skills) ? skills : getCatalog();
  const targets = binding?.targets;
  const connections = binding?.connections || [];
  const boundLines = formatBoundTargets(targets, connections);
  const sshBound = hasSshTarget(targets);
  const k8sBound = hasK8sTarget(targets);
  const names = tools
    .map((t) => `- ${toApiToolName(t.name)}: ${t.description}`)
    .join('\n');

  const targetRule = sshBound || k8sBound
    ? '2. 当前会话已绑定目标（见下方「当前绑定」）：优先直接对绑定目标操作；不要调用 server_list / server_connect，不要罗列全部服务器让用户再选。'
    : '2. 未绑定服务器/集群时，先请用户选择目标或调用 server_list / agent_ask_user。';

  const parts = [
    '你是 SSH 工具箱助手，帮助用户管理 SSH 连接、远程命令与服务器运维。',
    '请用简洁清晰的中文回答。',
    '',
    '规则：',
    '1. 只能使用下列已注册且可用的工具，禁止臆造执行结果。',
    targetRule,
    '3. 只读命令可直接执行；写/高危命令需用户确认后执行。',
    '4. 若用户任务匹配某个 Skill 的说明，先调用 agent_load_skill 加载完整步骤，再按步骤执行。',
  ];

  if (boundLines.length) {
    parts.push('', '当前绑定：', ...boundLines);
  }

  parts.push('', '可用工具：', names);

  if (skillList.length) {
    parts.push(
      '',
      '可用 Skills（任务匹配时先调用 agent_load_skill 加载完整说明，再执行）：',
      ...skillList.map((s) => `- ${s.name}: ${s.description}`)
    );
  }
  return parts.join('\n');
}

function messagesForLlm(session) {
  const out = [];
  for (const msg of session.messages || []) {
    if (msg.role === 'user' || msg.role === 'system') {
      out.push({ role: msg.role, content: msg.content });
    } else if (msg.role === 'assistant') {
      const entry = { role: 'assistant', content: msg.content || '' };
      if (msg.toolCalls?.length) entry.tool_calls = msg.toolCalls;
      out.push(entry);
    } else if (msg.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: msg.content,
      });
    }
  }
  return out;
}

function formatToolResult(result) {
  const payload = result.ok
    ? { ok: true, data: result.data }
    : { ok: false, error: result.error, riskLevel: result.riskLevel };
  const { text, truncated } = normalizePayload(payload);
  return { content: text, truncated };
}

function effectiveRisk(tool, args) {
  if (tool.riskLevel !== 'dynamic') return tool.riskLevel;
  if (tool.name === 'ssh.exec') return classifyCommand(args.command);
  if (tool.name === 'sftp.delete') return classifySftpDelete(args.remotePath);
  return tool.riskLevel;
}

function confirmReason(tool, args, risk) {
  if (tool.name === 'server.connect') return '建立 SSH 连接';
  return `执行工具 ${tool.name}（风险：${risk}）`;
}

async function handleToolPolicy(tool, args, requestConfirm, { policyMode, sessionAllowSet } = {}) {
  const risk = effectiveRisk(tool, args);
  const allowSet = sessionAllowSet || new Set();

  const policyAction = decide(risk, policyMode, allowSet);

  if (policyAction === 'auto') return { action: 'execute' };

  if (policyAction === 'deny') {
    return { action: 'reject', error: '策略拒绝执行该操作', riskLevel: risk };
  }

  const userDecision = await requestConfirm({
    toolName: tool.name,
    riskLevel: risk,
    args,
    reason: confirmReason(tool, args, risk),
  });

  if (userDecision === 'allow-once') {
    return { action: 'execute' };
  }
  if (userDecision === 'allow-session') {
    return { action: 'execute', sessionAllow: risk };
  }

  const denyMsg = tool.name === 'server.connect' ? '用户拒绝连接' : '用户拒绝';
  return { action: 'reject', error: denyMsg, riskLevel: risk };
}

async function callLlm(deps, opts) {
  if (typeof deps.chatCompletionStream === 'function') {
    return deps.chatCompletionStream(opts);
  }
  const result = await deps.chatCompletion(opts);
  const content = result.choices?.[0]?.message?.content;
  if (content && opts.onDelta) opts.onDelta({ type: 'content', text: content });
  return result;
}

function lastMessage(session) {
  const msgs = session?.messages || [];
  return msgs[msgs.length - 1] || null;
}

async function runAgentTurn(deps, { agentSessionId, userText }) {
  const {
    registry,
    agentSessions,
    settings,
    apiKey,
    requestConfirm,
    channelAdapter,
    buildContext,
    sessionAllowSet,
  } = deps;
  void channelAdapter;

  const emit = (payload) => {
    try {
      deps.onEvent?.({ agentSessionId, ...payload });
    } catch (_) {
      /* ignore UI event errors */
    }
  };

  const session = agentSessions.getSession(agentSessionId);
  if (!session) throw new Error('会话不存在');

  const afterUser = agentSessions.appendMessage(agentSessionId, { role: 'user', content: userText });
  emit({ type: 'user', message: lastMessage(afterUser) });

  let current = afterUser;
  const maxSteps = settings.maxSteps || 12;
  const turnCtx = typeof buildContext === 'function' ? buildContext(current) : {};
  const connections = turnCtx.getConnections?.() || [];
  const tools = filterToolsForTargets(registry.listAvailable(), current.targets);
  const systemPrompt = buildSystemPrompt(tools, undefined, {
    targets: current.targets,
    connections,
  });
  const openAiTools = toolsToOpenAi(tools);

  for (let step = 0; step < maxSteps; step += 1) {
    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...messagesForLlm(current),
    ];

    emit({ type: 'assistant_start' });
    const result = await callLlm(deps, {
      baseUrl: settings.baseUrl,
      apiKey,
      model: settings.model,
      messages: llmMessages,
      tools: openAiTools,
      timeoutMs: settings.timeoutMs,
      onDelta: (d) => {
        if (d?.type === 'content' && d.text) {
          emit({ type: 'assistant_delta', text: d.text });
        }
      },
    });

    const message = result.choices?.[0]?.message;
    if (!message) throw new Error('LLM 未返回有效消息');

    if (message.tool_calls?.length) {
      const toolCalls = normalizeToolCalls(message.tool_calls);
      const afterAssistant = agentSessions.appendMessage(agentSessionId, {
        role: 'assistant',
        content: message.content || '',
        toolCalls,
      });
      emit({ type: 'message', message: lastMessage(afterAssistant) });

      for (const tc of message.tool_calls) {
        const toolName = tc.function?.name;
        const tool = registry.get(toolName);
        let args = {};
        try {
          args = JSON.parse(tc.function?.arguments || '{}');
        } catch (_) {
          args = {};
        }

        if (!tool || tool.available === false) {
          const { content, truncated } = formatToolResult({
            ok: false,
            error: `未知或不可用工具: ${toolName}`,
          });
          const afterTool = agentSessions.appendMessage(agentSessionId, {
            role: 'tool',
            toolCallId: tc.id,
            name: toolName,
            content,
            truncated,
          });
          emit({ type: 'message', message: lastMessage(afterTool) });
          continue;
        }

        const ctx = buildContext(current);
        const policy = await handleToolPolicy(tool, args, requestConfirm, {
          policyMode: settings.policyMode,
          sessionAllowSet,
        });
        if (policy.sessionAllow && sessionAllowSet) {
          sessionAllowSet.add(policy.sessionAllow);
        }
        let execResult;
        if (policy.action === 'reject') {
          execResult = { ok: false, error: policy.error, riskLevel: policy.riskLevel };
        } else {
          execResult = await tool.execute(args, ctx);
        }

        const { content, truncated } = formatToolResult(execResult);
        const afterTool = agentSessions.appendMessage(agentSessionId, {
          role: 'tool',
          toolCallId: tc.id,
          name: toolName,
          content,
          truncated,
        });
        emit({ type: 'message', message: lastMessage(afterTool) });
      }

      current = agentSessions.getSession(agentSessionId);
      continue;
    }

    const afterFinal = agentSessions.appendMessage(agentSessionId, {
      role: 'assistant',
      content: message.content || '',
    });
    emit({ type: 'message', message: lastMessage(afterFinal) });
    emit({ type: 'done' });
    return { session: afterFinal };
  }

  const afterMax = agentSessions.appendMessage(agentSessionId, {
    role: 'assistant',
    content: '已达到最大推理步数，请简化问题后重试。',
  });
  emit({ type: 'message', message: lastMessage(afterMax) });
  emit({ type: 'done' });
  return { session: afterMax };
}

module.exports = {
  runAgentTurn,
  buildSystemPrompt,
  filterToolsForTargets,
  formatBoundTargets,
  toolsToOpenAi,
  normalizeToolCalls,
  normalizePayload,
  messagesForLlm,
  handleToolPolicy,
};
