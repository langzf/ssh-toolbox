const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createToolRegistry, toApiToolName } = require('./registry');

const dummyTool = {
  name: 'agent.load_skill',
  description: 'Load a skill',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => ({ ok: true }),
};

test('toOpenAiTools emits API-safe names without dots', () => {
  const registry = createToolRegistry([[dummyTool]]);
  const openAiTools = registry.toOpenAiTools();
  assert.equal(openAiTools.length, 1);
  assert.equal(openAiTools[0].function.name, 'agent_load_skill');
  assert.doesNotMatch(openAiTools[0].function.name, /\./);
});

test('get resolves dotted and underscore names', () => {
  const registry = createToolRegistry([[dummyTool]]);
  assert.equal(registry.get('agent.load_skill'), dummyTool);
  assert.equal(registry.get('agent_load_skill'), dummyTool);
  assert.equal(registry.get('missing'), null);
});

test('toApiToolName converts dots to underscores', () => {
  assert.equal(toApiToolName('agent.load_skill'), 'agent_load_skill');
  assert.equal(toApiToolName('metrics.fetch'), 'metrics_fetch');
});
