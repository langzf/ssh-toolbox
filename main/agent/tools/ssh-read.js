const { RISK } = require('../types');
const { classifyCommand } = require('../policy');
const { execOnSession } = require('../../metrics');

const WRITE_REFUSAL = '需升级到写操作层（L5）后才可执行写/高危命令';

function resolveSshSessionId(ctx) {
  const targets = ctx.agentSession?.targets || [];
  const sshTarget = targets.find((t) => t.type === 'ssh' && t.serverId);
  if (!sshTarget) throw new Error('未绑定服务器，请先选择目标服务器或调用 server.connect');
  return ctx.ensureSshSession(sshTarget.serverId);
}

function createSshReadTools() {
  const sshExec = {
    name: 'ssh.exec',
    description: '在已绑定服务器上执行只读 Shell 命令（写/高危命令在 L3 会被拒绝）',
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
      if (risk !== RISK.READ) {
        return { ok: false, error: WRITE_REFUSAL, riskLevel: risk };
      }

      try {
        const sessionId = await resolveSshSessionId(ctx);
        const timeoutMs = Number(args.timeoutMs) || 20000;
        const output = await execOnSession(ctx.sessions, sessionId, command, timeoutMs);
        return { ok: true, data: { output, riskLevel: RISK.READ } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

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

  return [sshExec, tailLog];
}

module.exports = { createSshReadTools, WRITE_REFUSAL };
