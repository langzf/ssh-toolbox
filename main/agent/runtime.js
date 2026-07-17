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

function buildSystemPrompt(tools) {
  const names = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  return [
    '你是 SSH 工具箱助手，帮助用户管理 SSH 连接、远程命令与服务器运维。',
    '请用简洁清晰的中文回答。',
    '',
    '规则：',
    '1. 只能使用下列已注册且可用的工具，禁止臆造执行结果。',
    '2. 未绑定服务器时，先请用户选择目标或调用 server.list / agent.ask_user。',
    '3. 只读命令可直接执行；写/高危命令需用户确认后执行。',
    '',
    '可用工具：',
    names,
  ].join('\n');
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

async function runAgentTurn(deps, { agentSessionId, userText }) {
  const {
    registry,
    agentSessions,
    chatCompletion,
    settings,
    apiKey,
    requestConfirm,
    buildContext,
    sessionAllowSet,
  } = deps;

  const session = agentSessions.getSession(agentSessionId);
  if (!session) throw new Error('会话不存在');

  agentSessions.appendMessage(agentSessionId, { role: 'user', content: userText });
  let current = agentSessions.getSession(agentSessionId);
  const maxSteps = settings.maxSteps || 12;
  const tools = registry.listAvailable();
  const systemPrompt = buildSystemPrompt(tools);

  for (let step = 0; step < maxSteps; step += 1) {
    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...messagesForLlm(current),
    ];

    const result = await chatCompletion({
      baseUrl: settings.baseUrl,
      apiKey,
      model: settings.model,
      messages: llmMessages,
      tools: registry.toOpenAiTools(),
      timeoutMs: settings.timeoutMs,
    });

    const message = result.choices?.[0]?.message;
    if (!message) throw new Error('LLM 未返回有效消息');

    if (message.tool_calls?.length) {
      const toolCalls = normalizeToolCalls(message.tool_calls);
      agentSessions.appendMessage(agentSessionId, {
        role: 'assistant',
        content: message.content || '',
        toolCalls,
      });

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
          agentSessions.appendMessage(agentSessionId, {
            role: 'tool',
            toolCallId: tc.id,
            name: toolName,
            content,
            truncated,
          });
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
        agentSessions.appendMessage(agentSessionId, {
          role: 'tool',
          toolCallId: tc.id,
          name: toolName,
          content,
          truncated,
        });
      }

      current = agentSessions.getSession(agentSessionId);
      continue;
    }

    agentSessions.appendMessage(agentSessionId, {
      role: 'assistant',
      content: message.content || '',
    });
    current = agentSessions.getSession(agentSessionId);
    return { session: current };
  }

  agentSessions.appendMessage(agentSessionId, {
    role: 'assistant',
    content: '已达到最大推理步数，请简化问题后重试。',
  });
  return { session: agentSessions.getSession(agentSessionId) };
}

module.exports = {
  runAgentTurn,
  buildSystemPrompt,
  normalizeToolCalls,
  normalizePayload,
  messagesForLlm,
  handleToolPolicy,
};
