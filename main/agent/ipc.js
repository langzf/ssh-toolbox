const { createAgentSettingsModule } = require('./settings');
const { chatCompletion } = require('./llm-client');

const SYSTEM_PROMPT =
  '你是 SSH 工具箱助手，帮助用户管理 SSH 连接、远程命令与服务器运维。请用简洁清晰的中文回答。';

function registerAgentIpc(ipcMain, { encryptSecret, decryptSecret }) {
  const agentSettings = createAgentSettingsModule({ encryptSecret, decryptSecret });

  ipcMain.handle('agent-settings-get', () => agentSettings.getPublicSettings());

  ipcMain.handle('agent-settings-save', (_event, partial) => agentSettings.saveSettings(partial));

  ipcMain.handle('agent-chat', async (_event, payload) => {
    const settings = agentSettings.getPublicSettings();
    const apiKey = agentSettings.getApiKey();
    const userMessages = Array.isArray(payload?.messages) ? payload.messages : [];
    const result = await chatCompletion({
      baseUrl: settings.baseUrl,
      apiKey,
      model: settings.model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...userMessages],
      timeoutMs: settings.timeoutMs,
    });
    return result.choices?.[0]?.message ?? result;
  });
}

module.exports = { registerAgentIpc };
