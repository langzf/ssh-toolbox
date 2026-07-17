const { createAgentSettingsModule } = require('./settings');
const { createAgentSessionsModule } = require('./sessions');
const { chatCompletion } = require('./llm-client');
const { runAgentTurn } = require('./runtime');
const { createDefaultRegistry } = require('./tools');

const SIMPLE_SYSTEM_PROMPT =
  '你是 SSH 工具箱助手，帮助用户管理 SSH 连接、远程命令与服务器运维。请用简洁清晰的中文回答。';

function agentSshSessionId(serverId) {
  return `agent-ssh-${serverId}`;
}

function createRequestConfirmL3() {
  return async ({ toolName }) => {
    if (toolName === 'server.connect') return 'allow-once';
    return 'deny';
  };
}

function registerAgentIpc(ipcMain, deps) {
  const { encryptSecret, decryptSecret, sshSessions, connectSsh, getConnections, getCredential } =
    deps;

  const agentSettings = createAgentSettingsModule({ encryptSecret, decryptSecret });
  const agentSessions = createAgentSessionsModule();
  const registry = createDefaultRegistry();

  async function ensureSshSession(serverId) {
    const sessionId = agentSshSessionId(serverId);
    if (sshSessions.has(sessionId)) return sessionId;

    const items = getConnections();
    const conn = items.find((c) => c.id === serverId);
    if (!conn) throw new Error(`未找到服务器: ${serverId}`);

    const cred = getCredential(serverId) || {};
    await connectSsh({
      sessionId,
      host: conn.host,
      port: conn.port || 22,
      username: conn.username,
      password: cred.password,
      privateKeyPath: conn.privateKeyPath,
      passphrase: cred.passphrase,
    });
    return sessionId;
  }

  function buildContext(agentSession) {
    return {
      sessions: sshSessions,
      getConnections,
      agentSession,
      ensureSshSession,
      requestConfirm: createRequestConfirmL3(),
    };
  }

  ipcMain.handle('agent-settings-get', () => agentSettings.getPublicSettings());

  ipcMain.handle('agent-settings-save', (_event, partial) => agentSettings.saveSettings(partial));

  ipcMain.handle('agent-sessions-list', () => agentSessions.listSessions());

  ipcMain.handle('agent-sessions-create', (_event, payload) => agentSessions.createSession(payload || {}));

  ipcMain.handle('agent-sessions-get', (_event, id) => agentSessions.getSession(id));

  ipcMain.handle('agent-sessions-append-message', (_event, { id, msg }) =>
    agentSessions.appendMessage(id, msg)
  );

  ipcMain.handle('agent-sessions-set-targets', (_event, { id, targets }) =>
    agentSessions.setTargets(id, targets)
  );

  ipcMain.handle('agent-sessions-delete', (_event, id) => agentSessions.deleteSession(id));

  ipcMain.handle('agent-chat', async (_event, payload) => {
    const settings = agentSettings.getPublicSettings();
    const apiKey = agentSettings.getApiKey();
    const userMessages = Array.isArray(payload?.messages) ? payload.messages : [];
    const result = await chatCompletion({
      baseUrl: settings.baseUrl,
      apiKey,
      model: settings.model,
      messages: [{ role: 'system', content: SIMPLE_SYSTEM_PROMPT }, ...userMessages],
      timeoutMs: settings.timeoutMs,
    });
    return result.choices?.[0]?.message ?? result;
  });

  ipcMain.handle('agent-send', async (_event, { agentSessionId, userText }) => {
    const settings = agentSettings.getPublicSettings();
    const apiKey = agentSettings.getApiKey();
    const result = await runAgentTurn(
      {
        registry,
        agentSessions,
        chatCompletion,
        settings,
        apiKey,
        requestConfirm: createRequestConfirmL3(),
        buildContext: (agentSession) => buildContext(agentSession),
      },
      { agentSessionId, userText: String(userText || '').trim() }
    );
    return result;
  });
}

module.exports = { registerAgentIpc, agentSshSessionId };
