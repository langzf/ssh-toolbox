'use strict';

const fs = require('fs');
const path = require('path');
const { getCatalog, parseFrontmatter } = require('./catalog');

function findEntry(name, skillsRoot) {
  const list = getCatalog(skillsRoot);
  const entry = list.find((s) => s.name === name);
  if (!entry) {
    const names = list.map((s) => s.name).join(', ') || '(无)';
    throw new Error(`未找到 skill「${name}」。可用: ${names}`);
  }
  return entry;
}

function loadSkill(name, skillsRoot) {
  const entry = findEntry(name, skillsRoot);
  const raw = fs.readFileSync(entry.skillPath, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  return {
    name: entry.name,
    description: entry.description || String(data.description || ''),
    content: body,
  };
}

function readSkillResource(name, relPath, skillsRoot) {
  const entry = findEntry(name, skillsRoot);
  const input = String(relPath || '').replace(/\\/g, '/');
  if (!input || path.isAbsolute(input) || input.includes('\0')) {
    throw new Error('非法资源路径');
  }
  const normalized = path.normalize(input);
  if (normalized.startsWith('..') || normalized.includes(`${path.sep}..`)) {
    throw new Error('非法资源路径');
  }
  const posix = normalized.split(path.sep).join('/');
  if (!posix.startsWith('references/') && !posix.startsWith('assets/')) {
    throw new Error('仅允许读取 references/ 或 assets/ 下的文件');
  }
  const abs = path.resolve(entry.dir, normalized);
  const rootResolved = path.resolve(entry.dir) + path.sep;
  if (abs !== path.resolve(entry.dir) && !abs.startsWith(rootResolved)) {
    throw new Error('非法资源路径');
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error(`资源不存在: ${posix}`);
  }
  const real = fs.realpathSync(abs);
  const realRoot = fs.realpathSync(entry.dir) + path.sep;
  if (!real.startsWith(realRoot)) {
    throw new Error('非法资源路径');
  }
  return {
    name: entry.name,
    path: posix,
    content: fs.readFileSync(real, 'utf8'),
  };
}

module.exports = { loadSkill, readSkillResource };
