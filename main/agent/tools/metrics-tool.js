const { RISK } = require('../types');
const { execOnSession, buildMetricsCommand, parseMetricsOutput } = require('../../metrics');

function createMetricsTool() {
  return {
    name: 'metrics.fetch',
    description: '获取已绑定服务器的 CPU、内存、磁盘、GPU 等指标',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: { type: 'object', properties: {} },
    async execute(_args, ctx) {
      const targets = ctx.agentSession?.targets || [];
      const sshTarget = targets.find((t) => t.type === 'ssh' && t.serverId);
      if (!sshTarget) {
        return { ok: false, error: '未绑定服务器，请先选择目标服务器' };
      }
      try {
        const sessionId = await ctx.ensureSshSession(sshTarget.serverId);
        const raw = await execOnSession(ctx.sessions, sessionId, buildMetricsCommand(), 25000);
        const data = parseMetricsOutput(raw);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };
}

module.exports = { createMetricsTool };
