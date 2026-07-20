const path = require('path');
const { app } = require('electron');
const { createAgentSettingsModule } = require('./settings');
const { createAgentSessionsModule } = require('./sessions');
const { chatCompletion } = require('./llm-client');
const { runAgentTurn } = require('./runtime');
const { createDefaultRegistry } = require('./tools');
const { createConfirmManager } = require('./confirm');
const { createNoopChannelAdapter } = require('./channel-adapter');
const { setDefaultSkillsRoot, resolveSkillsRoot } = require('./skills/catalog');

function resolveAppSkillsRoot() {
  try {
    if (app && typeof app.getAppPath === 'function') {
      return path.join(app.getAppPath(), 'skills');
    }
  } catch (_) {
    /* Electron app may not be ready in some test contexts */
  }
  return resolveSkillsRoot();
}

const SIMPLE_SYSTEM_PROMPT =
  '你是 SSH 工具箱助手，帮助用户管理 SSH 连接、远程命令与服务器运维。请用简洁清晰的中文回答。';

function agentSshSessionId(serverId) {
  return `agent-ssh-${serverId}`;
}

function registerAgentIpc(ipcMain, deps) {
  const {
    encryptSecret,
    decryptSecret,
    sshSessions,
    connectSsh,
    getConnections,
    getCredential,
    getWebContents,
    channelAdapter = createNoopChannelAdapter(),
  } = deps;

  const agentSettings = createAgentSettingsModule({ encryptSecret, decryptSecret });
  const agentSessions = createAgentSessionsModule();
  const skillsRoot = resolveAppSkillsRoot();
  setDefaultSkillsRoot(skillsRoot);
  const registry = createDefaultRegistry({ skillsRoot });
  const confirmManager = createConfirmManager(getWebContents);
  /** @type {Map<string, Set<string>>} */
  const sessionAllowSets = new Map();

  function getSessionAllowSet(agentSessionId) {
    if (!sessionAllowSets.has(agentSessionId)) {
      sessionAllowSets.set(agentSessionId, new Set());
    }
    return sessionAllowSets.get(agentSessionId);
  }

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

  ipcMain.handle('agent-sessions-delete', (_event, id) => {
    sessionAllowSets.delete(id);
    return agentSessions.deleteSession(id);
  });

  ipcMain.handle('agent-confirm-response', (_event, payload) => {
    const confirmId = payload?.confirmId;
    const decision = payload?.decision;
    if (!confirmId || !decision) return { ok: false, error: '缺少 confirmId 或 decision' };
    const handled = confirmManager.handleResponse({ confirmId, decision });
    return { ok: handled };
  });

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
    const sessionAllowSet = getSessionAllowSet(agentSessionId);
    const requestConfirm = confirmManager.createRequestConfirm(agentSessionId);
    const result = await runAgentTurn(
      {
        registry,
        agentSessions,
        chatCompletion,
        settings,
        apiKey,
        requestConfirm,
        channelAdapter,
        sessionAllowSet,
        buildContext: (agentSession) => buildContext(agentSession),
      },
      { agentSessionId, userText: String(userText || '').trim() }
    );
    return result;
  });
}

module.exports = { registerAgentIpc, agentSshSessionId };
