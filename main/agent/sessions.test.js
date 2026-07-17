const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAgentSessionsModule, MAX_CONTENT_LENGTH } = require('./sessions');

function createMemoryStore() {
  let data = {};
  return {
    get store() {
      return { ...data };
    },
    get(key, defaultValue) {
      return key in data ? data[key] : defaultValue;
    },
    set(key, value) {
      if (key !== null && typeof key === 'object' && !Array.isArray(key)) {
        data = { ...data, ...key };
        return;
      }
      data[key] = value;
    },
    delete(key) {
      delete data[key];
    },
  };
}

test('create → append → list → delete', () => {
  const mod = createAgentSessionsModule({ store: createMemoryStore() });
  const session = mod.createSession({ title: '测试会话' });
  assert.ok(session.id);
  assert.equal(session.title, '测试会话');
  assert.deepEqual(session.messages, []);

  mod.appendMessage(session.id, { role: 'user', content: '你好' });
  const listed = mod.listSessions();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, session.id);
  assert.equal(listed[0].messageCount, 1);

  const full = mod.getSession(session.id);
  assert.equal(full.messages.length, 1);
  assert.equal(full.messages[0].role, 'user');
  assert.equal(full.messages[0].content, '你好');

  assert.equal(mod.deleteSession(session.id), true);
  assert.equal(mod.listSessions().length, 0);
  assert.equal(mod.getSession(session.id), null);
});

test('appendMessage truncates long content', () => {
  const mod = createAgentSessionsModule({ store: createMemoryStore() });
  const session = mod.createSession();
  const long = 'x'.repeat(MAX_CONTENT_LENGTH + 500);
  mod.appendMessage(session.id, { role: 'assistant', content: long });
  const msg = mod.getSession(session.id).messages[0];
  assert.equal(msg.content.length, MAX_CONTENT_LENGTH);
  assert.equal(msg.truncated, true);
});

test('createSession auto-titles from first user message', () => {
  const mod = createAgentSessionsModule({ store: createMemoryStore() });
  const session = mod.createSession();
  mod.appendMessage(session.id, { role: 'user', content: '帮我看看磁盘空间' });
  assert.equal(mod.getSession(session.id).title, '帮我看看磁盘空间');
});
