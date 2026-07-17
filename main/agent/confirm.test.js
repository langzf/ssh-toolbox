const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createConfirmManager } = require('./confirm');

const REQ = { toolName: 'server.connect', riskLevel: 'write', args: { serverId: 's1' }, reason: '建立 SSH 连接' };

function mockWebContents({ destroyed = false, onSend } = {}) {
  return {
    isDestroyed: () => destroyed,
    send: (channel, payload) => onSend?.(channel, payload),
  };
}

test('requestConfirm: timeout resolves deny', async () => {
  const wc = mockWebContents();
  const mgr = createConfirmManager(() => wc, { confirmTimeoutMs: 30 });
  const requestConfirm = mgr.createRequestConfirm('sess-1');

  const result = await requestConfirm(REQ);
  assert.equal(result, 'deny');
});

test('handleResponse: allow-once resolves decision', async () => {
  const sent = [];
  const wc = mockWebContents({ onSend: (_, p) => sent.push(p) });
  const mgr = createConfirmManager(() => wc, { confirmTimeoutMs: 60_000 });
  const requestConfirm = mgr.createRequestConfirm('sess-1');

  const promise = requestConfirm(REQ);
  assert.equal(sent.length, 1);
  const handled = mgr.handleResponse({ confirmId: sent[0].confirmId, decision: 'allow-once' });
  assert.equal(handled, true);
  assert.equal(await promise, 'allow-once');
});

test('handleResponse: allow-session resolves decision', async () => {
  const sent = [];
  const wc = mockWebContents({ onSend: (_, p) => sent.push(p) });
  const mgr = createConfirmManager(() => wc, { confirmTimeoutMs: 60_000 });
  const requestConfirm = mgr.createRequestConfirm('sess-1');

  const promise = requestConfirm(REQ);
  const handled = mgr.handleResponse({ confirmId: sent[0].confirmId, decision: 'allow-session' });
  assert.equal(handled, true);
  assert.equal(await promise, 'allow-session');
});

test('handleResponse: deny and unknown decisions resolve deny', async () => {
  const sent = [];
  const wc = mockWebContents({ onSend: (_, p) => sent.push(p) });
  const mgr = createConfirmManager(() => wc, { confirmTimeoutMs: 60_000 });
  const requestConfirm = mgr.createRequestConfirm('sess-1');

  const promise = requestConfirm(REQ);
  mgr.handleResponse({ confirmId: sent[0].confirmId, decision: 'deny' });
  assert.equal(await promise, 'deny');
});

test('handleResponse: unknown confirmId returns false', () => {
  const mgr = createConfirmManager(() => mockWebContents());
  assert.equal(mgr.handleResponse({ confirmId: 'missing', decision: 'allow-once' }), false);
});

test('requestConfirm: missing webContents resolves deny immediately', async () => {
  const mgr = createConfirmManager(() => null, { confirmTimeoutMs: 60_000 });
  const requestConfirm = mgr.createRequestConfirm('sess-1');
  const result = await requestConfirm(REQ);
  assert.equal(result, 'deny');
});

test('requestConfirm: destroyed webContents resolves deny immediately', async () => {
  const wc = mockWebContents({ destroyed: true });
  const mgr = createConfirmManager(() => wc, { confirmTimeoutMs: 60_000 });
  const requestConfirm = mgr.createRequestConfirm('sess-1');
  const result = await requestConfirm(REQ);
  assert.equal(result, 'deny');
});
