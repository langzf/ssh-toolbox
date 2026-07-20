const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  parseFrontmatter,
  loadCatalog,
  clearCatalogCache,
  resolveSkillsRoot,
} = require('./catalog');

test('parseFrontmatter extracts name description and body', () => {
  const raw = `---\nname: foo\ndescription: Bar baz\n---\n\n# Hello\n`;
  const { data, body } = parseFrontmatter(raw);
  assert.equal(data.name, 'foo');
  assert.equal(data.description, 'Bar baz');
  assert.match(body, /# Hello/);
  assert.doesNotMatch(body, /^---/);
});

test('loadCatalog finds fixture skill', () => {
  clearCatalogCache();
  const root = path.join(__dirname, '_fixtures');
  const list = loadCatalog(root);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'sample-skill');
  assert.match(list[0].description, /Sample skill/);
  assert.ok(list[0].skillPath.endsWith('SKILL.md'));
});

test('resolveSkillsRoot defaults under package root skills/', () => {
  const root = resolveSkillsRoot();
  assert.ok(root.endsWith(`${path.sep}skills`));
});
