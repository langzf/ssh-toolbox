const { RISK } = require('../types');

function createServerTools() {
  const serverList = {
    name: 'server.list',
    description: '列出已保存的 SSH 服务器连接',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: { type: 'object', properties: {} },
    async execute(_args, ctx) {
      const items = ctx.getConnections?.() || [];
      const safe = items.map(({ id, label, host, port, username }) => ({
        id,
        label: label || host,
        host,
        port: port || 22,
        username,
      }));
      return { ok: true, data: safe };
    },
  };

  const serverConnect = {
    name: 'server.connect',
    description: '建立或复用与指定已保存服务器的 SSH 会话',
    riskLevel: RISK.WRITE,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        serverId: { type: 'string', description: 'server.list 返回的服务器 id' },
      },
      required: ['serverId'],
    },
    async execute(args, ctx) {
      const serverId = String(args.serverId || '').trim();
      if (!serverId) return { ok: false, error: '缺少 serverId' };
      try {
        const sessionId = await ctx.ensureSshSession(serverId);
        return { ok: true, data: { serverId, sshSessionId: sessionId } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  return [serverList, serverConnect];
}

module.exports = { createServerTools };
