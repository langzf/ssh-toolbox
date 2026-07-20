const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clearCatalogCache, loadCatalog, resolveSkillsRoot } = require('./catalog');

const REQUIRED = [
  'host-health-check',
  'disk-space-triage',
  'log-investigation',
  'service-status-check',
  'safe-service-restart',
  'config-change-checklist',
  'k8s-pod-troubleshoot',
  'k8s-workload-restart',
];

test('builtin skills catalog has 8 required skills', () => {
  clearCatalogCache();
  const list = loadCatalog(resolveSkillsRoot());
  assert.equal(list.length, 8);
  const names = new Set(list.map((s) => s.name));
  for (const n of REQUIRED) assert.ok(names.has(n), `missing ${n}`);
});
