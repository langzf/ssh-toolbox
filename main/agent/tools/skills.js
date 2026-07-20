'use strict';

const { RISK } = require('../types');
const { loadSkill, readSkillResource } = require('../skills/loader');

function createSkillTools(opts = {}) {
  const skillsRoot = opts.skillsRoot;

  const loadSkillTool = {
    name: 'agent.load_skill',
    description:
      '加载内置运维 Skill 的完整说明（Agent Skills 标准）。在任务匹配某个 skill 的 description 时先调用本工具，再按说明使用其他工具。',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill 名称，如 host-health-check' },
      },
      required: ['name'],
    },
    async execute(args) {
      try {
        const data = loadSkill(String(args.name || '').trim(), skillsRoot);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  const readResourceTool = {
    name: 'agent.read_skill_resource',
    description:
      '读取已加载 skill 目录下 references/ 或 assets/ 中的附属文件。',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill 名称' },
        path: {
          type: 'string',
          description: '相对路径，必须以 references/ 或 assets/ 开头',
        },
      },
      required: ['name', 'path'],
    },
    async execute(args) {
      try {
        const data = readSkillResource(
          String(args.name || '').trim(),
          String(args.path || '').trim(),
          skillsRoot
        );
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  return [loadSkillTool, readResourceTool];
}

module.exports = { createSkillTools };
