const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { clearCatalogCache } = require('../skills/catalog');
const { createSkillTools } = require('./skills');

const root = path.join(__dirname, '../skills/_fixtures');

test('agent.load_skill returns content', async () => {
  clearCatalogCache();
  const [loadSkillTool] = createSkillTools({ skillsRoot: root });
  const res = await loadSkillTool.execute({ name: 'sample-skill' });
  assert.equal(res.ok, true);
  assert.match(res.data.content, /sample thing/i);
});

test('agent.load_skill unknown returns ok false', async () => {
  clearCatalogCache();
  const [loadSkillTool] = createSkillTools({ skillsRoot: root });
  const res = await loadSkillTool.execute({ name: 'missing' });
  assert.equal(res.ok, false);
  assert.match(res.error, /可用/);
});

test('agent.read_skill_resource works', async () => {
  clearCatalogCache();
  const tools = createSkillTools({ skillsRoot: root });
  const readTool = tools.find((t) => t.name === 'agent.read_skill_resource');
  const res = await readTool.execute({ name: 'sample-skill', path: 'references/notes.md' });
  assert.equal(res.ok, true);
  assert.match(res.data.content, /Fixture notes/);
});
