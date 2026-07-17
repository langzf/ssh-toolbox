const { RISK } = require('../types');
const { execOnSession } = require('../../metrics');

function resolveSshSessionId(ctx) {
  const targets = ctx.agentSession?.targets || [];
  const sshTarget = targets.find((t) => t.type === 'ssh' && t.serverId);
  if (!sshTarget) throw new Error('未绑定服务器，请先选择目标服务器或调用 server.connect');
  return ctx.ensureSshSession(sshTarget.serverId);
}

function createSshReadTools() {
  const tailLog = {
    name: 'ssh.tail_log',
    description: '读取远程日志文件末尾若干行',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '远程日志文件路径' },
        lines: { type: 'number', description: '行数，默认 100' },
      },
      required: ['path'],
    },
    async execute(args, ctx) {
      const filePath = String(args.path || '').trim();
      if (!filePath) return { ok: false, error: '缺少 path' };
      const lines = Math.min(Math.max(Number(args.lines) || 100, 1), 2000);
      const quoted = filePath.replace(/'/g, `'\\''`);
      const command = `tail -n ${lines} '${quoted}' 2>/dev/null || tail -n ${lines} "${filePath.replace(/"/g, '\\"')}"`;

      try {
        const sessionId = await resolveSshSessionId(ctx);
        const output = await execOnSession(ctx.sessions, sessionId, command, 25000);
        return { ok: true, data: { path: filePath, lines, output } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  return [tailLog];
}

module.exports = { createSshReadTools };
