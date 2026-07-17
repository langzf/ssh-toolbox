const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBaseUrl, buildChatUrl } = require('./llm-client');

test('normalizeBaseUrl strips trailing slash and /v1', () => {
  assert.equal(normalizeBaseUrl('https://x.com/v1/'), 'https://x.com');
});

test('buildChatUrl appends /v1/chat/completions', () => {
  assert.equal(buildChatUrl('https://x.com'), 'https://x.com/v1/chat/completions');
});
