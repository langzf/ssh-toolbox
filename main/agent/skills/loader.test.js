const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { clearCatalogCache } = require('./catalog');
const { loadSkill, readSkillResource } = require('./loader');

const root = path.join(__dirname, '_fixtures');

test('loadSkill returns body without frontmatter', () => {
  clearCatalogCache();
  const skill = loadSkill('sample-skill', root);
  assert.equal(skill.name, 'sample-skill');
  assert.doesNotMatch(skill.content, /^---/);
  assert.match(skill.content, /Do the sample thing/);
});

test('loadSkill unknown name throws', () => {
  clearCatalogCache();
  assert.throws(() => loadSkill('nope', root), /未找到|不存在|unknown/i);
});

test('readSkillResource reads references file', () => {
  clearCatalogCache();
  const res = readSkillResource('sample-skill', 'references/notes.md', root);
  assert.match(res.content, /Fixture notes/);
});

test('readSkillResource rejects path escape', () => {
  clearCatalogCache();
  assert.throws(() => readSkillResource('sample-skill', '../catalog.js', root));
  assert.throws(() => readSkillResource('sample-skill', 'scripts/x.sh', root));
});
