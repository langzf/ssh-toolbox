const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runAgentTurn, buildSystemPrompt } = require('./runtime');
const { createToolRegistry } = require('./tools/registry');
const { RISK } = require('./types');

function createMemorySessions() {
  const sessions = new Map();
  return {
    getSession(id) {
      return sessions.get(id) || null;
    },
    appendMessage(id, partial) {
      const s = sessions.get(id);
      if (!s) throw new Error('会话不存在');
      const msg = {
        id: partial.id || `msg-${Date.now()}`,
        role: partial.role,
        content: partial.content ?? '',
        createdAt: Date.now(),
      };
      if (partial.toolCalls) msg.toolCalls = partial.toolCalls;
      if (partial.toolCallId) msg.toolCallId = partial.toolCallId;
      if (partial.name) msg.name = partial.name;
      if (partial.truncated) msg.truncated = partial.truncated;
      s.messages.push(msg);
      s.updatedAt = Date.now();
      return s;
    },
    createSession() {
      const s = {
        id: 'agent-test-1',
        title: '测试',
        messages: [],
        targets: [{ type: 'ssh', serverId: 'srv-1' }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      sessions.set(s.id, s);
      return s;
    },
  };
}

function createMockRegistry() {
  const metricsTool = {
    name: 'metrics.fetch',
    description: '获取指标',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ ok: true, data: { cpu: { percent: 12 } } }),
  };
  return createToolRegistry([[metricsTool]]);
}

test('buildSystemPrompt lists tool names', () => {
  const prompt = buildSystemPrompt([{ name: 'metrics.fetch', description: '指标' }], []);
  assert.match(prompt, /metrics_fetch/);
  assert.match(prompt, /禁止臆造/);
});

test('buildSystemPrompt advertises skills', () => {
  const prompt = buildSystemPrompt(
    [{ name: 'metrics.fetch', description: '指标' }],
    [{ name: 'host-health-check', description: '主机体检。Use when user asks for health check.' }]
  );
  assert.match(prompt, /可用 Skills/);
  assert.match(prompt, /host-health-check/);
  assert.match(prompt, /agent_load_skill/);
  assert.match(prompt, /metrics_fetch/);
});

test('runAgentTurn: mock LLM tool call then final text', async () => {
  const agentSessions = createMemorySessions();
  const session = agentSessions.createSession();
  let call = 0;

  const chatCompletion = async () => {
    call += 1;
    if (call === 1) {
      return {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'metrics_fetch', arguments: '{}' },
                },
              ],
            },
          },
        ],
      };
    }
    return {
      choices: [{ message: { role: 'assistant', content: 'CPU 使用率约 12%。' } }],
    };
  };

  const result = await runAgentTurn(
    {
      registry: createMockRegistry(),
      agentSessions,
      chatCompletion,
      settings: { baseUrl: 'https://x.com', model: 'm', maxSteps: 5, timeoutMs: 1000 },
      apiKey: 'k',
      requestConfirm: async () => 'deny',
      buildContext: () => ({ agentSession: session, sessions: new Map() }),
    },
    { agentSessionId: session.id, userText: '看看 CPU' }
  );

  const msgs = result.session.messages;
  assert.equal(msgs[0].role, 'user');
  assert.equal(msgs[0].content, '看看 CPU');
  assert.equal(msgs[1].role, 'assistant');
  assert.equal(msgs[1].toolCalls?.[0]?.function?.name, 'metrics_fetch');
  assert.equal(msgs[2].role, 'tool');
  assert.equal(msgs[2].name, 'metrics_fetch');
  assert.match(msgs[2].content, /"percent":12/);
  assert.equal(msgs[3].role, 'assistant');
  assert.match(msgs[3].content, /12%/);
});

test('runAgentTurn: write ssh.exec confirms then executes on allow-once', async () => {
  const agentSessions = createMemorySessions();
  const session = agentSessions.createSession();
  let call = 0;
  let executed = false;

  const sshTool = {
    name: 'ssh.exec',
    description: 'exec',
    riskLevel: 'dynamic',
    available: true,
    inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    execute: async () => {
      executed = true;
      return { ok: true, data: { output: 'restarted', riskLevel: RISK.WRITE } };
    },
  };

  const registry = createToolRegistry([[sshTool]]);

  const chatCompletion = async () => {
    call += 1;
    if (call === 1) {
      return {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_w',
                  type: 'function',
                  function: {
                    name: 'ssh_exec',
                    arguments: JSON.stringify({ command: 'systemctl restart nginx' }),
                  },
                },
              ],
            },
          },
        ],
      };
    }
    return { choices: [{ message: { role: 'assistant', content: '已重启 nginx。' } }] };
  };

  await runAgentTurn(
    {
      registry,
      agentSessions,
      chatCompletion,
      settings: { model: 'm', maxSteps: 5, policyMode: 'standard' },
      apiKey: 'k',
      requestConfirm: async () => 'allow-once',
      buildContext: () => ({ agentSession: session, sessions: new Map() }),
    },
    { agentSessionId: session.id, userText: '重启 nginx' }
  );

  assert.equal(executed, true);
  const toolMsg = agentSessions.getSession(session.id).messages.find((m) => m.role === 'tool');
  assert.match(toolMsg.content, /restarted/);
});

test('runAgentTurn: write ssh.exec denied when user rejects confirm', async () => {
  const agentSessions = createMemorySessions();
  const session = agentSessions.createSession();
  let call = 0;
  let executed = false;

  const sshTool = {
    name: 'ssh.exec',
    description: 'exec',
    riskLevel: 'dynamic',
    available: true,
    inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    execute: async () => {
      executed = true;
      return { ok: true, data: { output: 'should not run' } };
    },
  };

  const registry = createToolRegistry([[sshTool]]);

  const chatCompletion = async () => {
    call += 1;
    if (call === 1) {
      return {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_w',
                  type: 'function',
                  function: {
                    name: 'ssh_exec',
                    arguments: JSON.stringify({ command: 'systemctl restart nginx' }),
                  },
                },
              ],
            },
          },
        ],
      };
    }
    return { choices: [{ message: { role: 'assistant', content: '用户已拒绝。' } }] };
  };

  await runAgentTurn(
    {
      registry,
      agentSessions,
      chatCompletion,
      settings: { model: 'm', maxSteps: 5, policyMode: 'standard' },
      apiKey: 'k',
      requestConfirm: async () => 'deny',
      buildContext: () => ({ agentSession: session, sessions: new Map() }),
    },
    { agentSessionId: session.id, userText: '重启 nginx' }
  );

  assert.equal(executed, false);
  const toolMsg = agentSessions.getSession(session.id).messages.find((m) => m.role === 'tool');
  assert.match(toolMsg.content, /用户拒绝/);
});
