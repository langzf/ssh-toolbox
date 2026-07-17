const Store = require('electron-store');
const { DEFAULT_AGENT_SETTINGS } = require('./types');

const API_KEY_ID = 'agentApiKey';

function createAgentSettingsModule({ encryptSecret, decryptSecret }) {
  const settingsStore = new Store({ name: 'agent-settings' });
  const credentialStore = new Store({ name: 'credentials' });

  function getApiKey() {
    const record = credentialStore.get(API_KEY_ID);
    if (!record?.apiKey) return null;
    try {
      return decryptSecret(record.apiKey) || null;
    } catch (_) {
      credentialStore.delete(API_KEY_ID);
      return null;
    }
  }

  function setApiKey(key) {
    if (!key) {
      credentialStore.delete(API_KEY_ID);
      return;
    }
    credentialStore.set(API_KEY_ID, {
      apiKey: encryptSecret(key),
    });
  }

  function getPublicSettings() {
    const stored = settingsStore.store;
    return {
      baseUrl: stored.baseUrl ?? DEFAULT_AGENT_SETTINGS.baseUrl,
      model: stored.model ?? DEFAULT_AGENT_SETTINGS.model,
      policyMode: stored.policyMode ?? DEFAULT_AGENT_SETTINGS.policyMode,
      maxSteps: stored.maxSteps ?? DEFAULT_AGENT_SETTINGS.maxSteps,
      timeoutMs: stored.timeoutMs ?? DEFAULT_AGENT_SETTINGS.timeoutMs,
      hasApiKey: Boolean(getApiKey()),
    };
  }

  function saveSettings(partial) {
    const { apiKey, ...rest } = partial || {};
    if (apiKey !== undefined) {
      if (apiKey) setApiKey(apiKey);
      else credentialStore.delete(API_KEY_ID);
    }
    const current = { ...DEFAULT_AGENT_SETTINGS, ...settingsStore.store };
    settingsStore.set({ ...current, ...rest });
    return getPublicSettings();
  }

  return { getPublicSettings, saveSettings, getApiKey, setApiKey };
}

module.exports = { createAgentSettingsModule };
