const { classifyCommand } = require('../policy');
const { execOnSession } = require('../../metrics');

function resolveSshSessionId(ctx) {
  const targets = ctx.agentSession?.targets || [];
  const sshTarget = targets.find((t) => t.type === 'ssh' && t.serverId);
  if (!sshTarget) throw new Error('未绑定服务器，请先选择目标服务器或调用 server.connect');
  return ctx.ensureSshSession(sshTarget.serverId);
}

function createSshWriteTools() {
  const sshExec = {
    name: 'ssh.exec',
    description: '在已绑定服务器上执行 Shell 命令（风险由命令分类器动态判定，写/高危需确认）',
    riskLevel: 'dynamic',
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令' },
        timeoutMs: { type: 'number', description: '超时毫秒，默认 20000' },
      },
      required: ['command'],
    },
    async execute(args, ctx) {
      const command = String(args.command || '').trim();
      if (!command) return { ok: false, error: '缺少 command' };

      const risk = classifyCommand(command);
      try {
        const sessionId = await resolveSshSessionId(ctx);
        const timeoutMs = Number(args.timeoutMs) || 20000;
        const output = await execOnSession(ctx.sessions, sessionId, command, timeoutMs);
        return { ok: true, data: { output, riskLevel: risk } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  return [sshExec];
}

module.exports = { createSshWriteTools };
