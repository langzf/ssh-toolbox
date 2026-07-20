'use strict';

const fs = require('fs');
const path = require('path');

const cache = new Map();
/** @type {string | null} */
let defaultSkillsRoot = null;

function setDefaultSkillsRoot(root) {
  defaultSkillsRoot = root;
}

function resolveSkillsRoot(appRoot) {
  if (appRoot) return path.join(appRoot, 'skills');
  if (defaultSkillsRoot) return defaultSkillsRoot;
  return path.join(__dirname, '..', '..', '..', 'skills');
}

function parseFrontmatter(raw) {
  const text = String(raw || '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: text };
  const yaml = match[1];
  const body = match[2].replace(/^\r?\n/, '');
  const data = {};
  for (const line of yaml.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[m[1]] = value;
  }
  return { data, body };
}

function loadCatalog(skillsRoot) {
  const root = skillsRoot || resolveSkillsRoot();
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith('_') || ent.name.startsWith('.')) continue;
    const skillPath = path.join(root, ent.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const raw = fs.readFileSync(skillPath, 'utf8');
    const { data } = parseFrontmatter(raw);
    const name = String(data.name || ent.name).trim();
    const description = String(data.description || '').trim();
    if (!name || !description) continue;
    if (name !== ent.name) continue;
    out.push({
      name,
      description,
      dir: path.join(root, ent.name),
      skillPath,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function getCatalog(skillsRoot) {
  const root = skillsRoot || resolveSkillsRoot();
  if (!cache.has(root)) cache.set(root, loadCatalog(root));
  return cache.get(root);
}

function clearCatalogCache() {
  cache.clear();
}

function clearDefaultSkillsRoot() {
  defaultSkillsRoot = null;
}

module.exports = {
  resolveSkillsRoot,
  setDefaultSkillsRoot,
  clearDefaultSkillsRoot,
  parseFrontmatter,
  loadCatalog,
  getCatalog,
  clearCatalogCache,
};
