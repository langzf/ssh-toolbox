const { RISK } = require('../types');
const { ensureSftp } = require('../../sftp');

function promisify(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function mapDirEntry(item) {
  const isDirectory = item.attrs.isDirectory();
  return {
    name: item.filename,
    isDirectory,
    size: isDirectory ? null : item.attrs.size,
    mtime: item.attrs.mtime ? item.attrs.mtime * 1000 : null,
  };
}

async function resolveSshSessionId(ctx) {
  const targets = ctx.agentSession?.targets || [];
  const sshTarget = targets.find((t) => t.type === 'ssh' && t.serverId);
  if (!sshTarget) throw new Error('未绑定服务器，请先选择目标服务器');
  return ctx.ensureSshSession(sshTarget.serverId);
}

function createSftpReadTools() {
  const sftpList = {
    name: 'sftp.list',
    description: '列出远程目录内容',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        remotePath: { type: 'string', description: '远程目录路径，默认 /' },
      },
    },
    async execute(args, ctx) {
      try {
        const sessionId = await resolveSshSessionId(ctx);
        const sftp = await ensureSftp(ctx.sessions, sessionId);
        const dir = args.remotePath || '/';
        const list = await promisify((cb) => sftp.readdir(dir, cb));
        const items = list
          .map(mapDirEntry)
          .filter((item) => item.name !== '.' && item.name !== '..')
          .sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          });
        return { ok: true, data: { remotePath: dir, items } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  const sftpRead = {
    name: 'sftp.read',
    description: '读取远程文本文件内容（自动截断过长内容）',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        remotePath: { type: 'string', description: '远程文件路径' },
        maxBytes: { type: 'number', description: '最大读取字节，默认 65536' },
      },
      required: ['remotePath'],
    },
    async execute(args, ctx) {
      const remotePath = String(args.remotePath || '').trim();
      if (!remotePath) return { ok: false, error: '缺少 remotePath' };
      const maxBytes = Math.min(Math.max(Number(args.maxBytes) || 65536, 1024), 256 * 1024);

      try {
        const sessionId = await resolveSshSessionId(ctx);
        const sftp = await ensureSftp(ctx.sessions, sessionId);
        const buf = await promisify((cb) => sftp.readFile(remotePath, cb));
        const truncated = buf.length > maxBytes;
        const slice = truncated ? buf.subarray(0, maxBytes) : buf;
        return {
          ok: true,
          data: {
            remotePath,
            content: slice.toString('utf8'),
            truncated,
            size: buf.length,
          },
        };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  const sftpWrite = {
    name: 'sftp.write',
    description: '写入远程文件（L5 启用）',
    riskLevel: RISK.WRITE,
    available: false,
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      return { ok: false, error: '工具尚未启用' };
    },
  };

  const sftpUpload = {
    name: 'sftp.upload',
    description: '上传本地文件到远程（L5 启用）',
    riskLevel: RISK.WRITE,
    available: false,
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      return { ok: false, error: '工具尚未启用' };
    },
  };

  const sftpDelete = {
    name: 'sftp.delete',
    description: '删除远程文件或目录（L5 启用）',
    riskLevel: RISK.DANGER,
    available: false,
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      return { ok: false, error: '工具尚未启用' };
    },
  };

  return [sftpList, sftpRead, sftpWrite, sftpUpload, sftpDelete];
}

module.exports = { createSftpReadTools };
