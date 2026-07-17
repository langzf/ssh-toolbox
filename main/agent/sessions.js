const MAX_CONTENT_LENGTH = 20_000;

function uid(prefix = 'msg') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeContent(content) {
  const text = String(content ?? '');
  if (text.length <= MAX_CONTENT_LENGTH) return { content: text };
  return { content: text.slice(0, MAX_CONTENT_LENGTH), truncated: true };
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

function createAgentSessionsModule({ store: injectedStore, Store: StoreClass } = {}) {
  const Store = StoreClass || require('electron-store');
  const store = injectedStore || new Store({ name: 'agent-sessions' });

  function getSessionsArray() {
    const arr = store.get('sessions');
    return Array.isArray(arr) ? arr : [];
  }

  function saveSessionsArray(sessions) {
    store.set('sessions', sessions);
  }

  function listSessions() {
    return getSessionsArray()
      .map(({ id, title, createdAt, updatedAt, messages }) => ({
        id,
        title,
        createdAt,
        updatedAt,
        messageCount: messages?.length ?? 0,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function createSession({ title } = {}) {
    const now = Date.now();
    const session = {
      id: uid('agent'),
      title: title?.trim() || '新对话',
      createdAt: now,
      updatedAt: now,
      messages: [],
      targets: [],
    };
    const sessions = getSessionsArray();
    sessions.unshift(session);
    saveSessionsArray(sessions);
    return session;
  }

  function getSession(id) {
    return getSessionsArray().find((s) => s.id === id) || null;
  }

  function appendMessage(id, partial) {
    const sessions = getSessionsArray();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error('会话不存在');

    const { content, truncated } = normalizeContent(partial.content);
    const msg = {
      id: partial.id || uid('msg'),
      role: partial.role,
      content,
      createdAt: partial.createdAt || Date.now(),
    };
    if (truncated) msg.truncated = true;
    if (partial.toolCalls) msg.toolCalls = normalizeToolCalls(partial.toolCalls);
    if (partial.toolCallId) msg.toolCallId = partial.toolCallId;
    if (partial.name) msg.name = partial.name;

    sessions[idx].messages.push(msg);
    sessions[idx].updatedAt = Date.now();

    if (sessions[idx].title === '新对话' && partial.role === 'user' && content.trim()) {
      const t = content.trim();
      sessions[idx].title = t.length > 40 ? `${t.slice(0, 40)}…` : t;
    }

    saveSessionsArray(sessions);
    return sessions[idx];
  }

  function setTargets(id, targets) {
    const sessions = getSessionsArray();
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error('会话不存在');
    sessions[idx].targets = Array.isArray(targets) ? targets : [];
    sessions[idx].updatedAt = Date.now();
    saveSessionsArray(sessions);
    return sessions[idx];
  }

  function deleteSession(id) {
    const sessions = getSessionsArray();
    const next = sessions.filter((s) => s.id !== id);
    if (next.length === sessions.length) return false;
    saveSessionsArray(next);
    return true;
  }

  return { listSessions, createSession, getSession, appendMessage, setTargets, deleteSession };
}

module.exports = { createAgentSessionsModule, MAX_CONTENT_LENGTH, normalizeToolCalls };
