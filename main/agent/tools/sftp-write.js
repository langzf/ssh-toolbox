const fs = require('fs');
const { RISK } = require('../types');
const { classifySftpDelete } = require('../policy');
const { ensureSftp } = require('../../sftp');

function promisify(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

async function resolveSshSessionId(ctx) {
  const targets = ctx.agentSession?.targets || [];
  const sshTarget = targets.find((t) => t.type === 'ssh' && t.serverId);
  if (!sshTarget) throw new Error('未绑定服务器，请先选择目标服务器');
  return ctx.ensureSshSession(sshTarget.serverId);
}

function createSftpWriteTools() {
  const sftpWrite = {
    name: 'sftp.write',
    description: '写入或覆盖远程文本文件',
    riskLevel: RISK.WRITE,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        remotePath: { type: 'string', description: '远程文件路径' },
        content: { type: 'string', description: '要写入的文本内容' },
        encoding: { type: 'string', description: '编码，默认 utf8' },
      },
      required: ['remotePath', 'content'],
    },
    async execute(args, ctx) {
      const remotePath = String(args.remotePath || '').trim();
      if (!remotePath) return { ok: false, error: '缺少 remotePath' };
      const content = args.content ?? '';
      const encoding = args.encoding || 'utf8';

      try {
        const sessionId = await resolveSshSessionId(ctx);
        const sftp = await ensureSftp(ctx.sessions, sessionId);
        await promisify((cb) => sftp.writeFile(remotePath, content, encoding, cb));
        return { ok: true, data: { remotePath, bytesWritten: Buffer.byteLength(content, encoding) } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  const sftpUpload = {
    name: 'sftp.upload',
    description: '从本机路径上传文件到远程',
    riskLevel: RISK.WRITE,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        localPath: { type: 'string', description: '本机源文件绝对路径' },
        remotePath: { type: 'string', description: '远程目标路径（含文件名）' },
      },
      required: ['localPath', 'remotePath'],
    },
    async execute(args, ctx) {
      const localPath = String(args.localPath || '').trim();
      const remotePath = String(args.remotePath || '').trim();
      if (!localPath) return { ok: false, error: '缺少 localPath' };
      if (!remotePath) return { ok: false, error: '缺少 remotePath' };
      if (!fs.existsSync(localPath)) return { ok: false, error: `本机文件不存在: ${localPath}` };

      try {
        const sessionId = await resolveSshSessionId(ctx);
        const sftp = await ensureSftp(ctx.sessions, sessionId);
        await promisify((cb) => sftp.fastPut(localPath, remotePath, cb));
        const stat = fs.statSync(localPath);
        return { ok: true, data: { localPath, remotePath, size: stat.size } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  const sftpDelete = {
    name: 'sftp.delete',
    description: '删除远程文件或空目录（根目录或 $HOME 等破坏性路径升为 danger）',
    riskLevel: 'dynamic',
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        remotePath: { type: 'string', description: '远程文件或目录路径' },
        isDirectory: { type: 'boolean', description: '是否为目录，默认 false' },
      },
      required: ['remotePath'],
    },
    async execute(args, ctx) {
      const remotePath = String(args.remotePath || '').trim();
      if (!remotePath) return { ok: false, error: '缺少 remotePath' };
      const isDirectory = Boolean(args.isDirectory);
      const risk = classifySftpDelete(remotePath);

      try {
        const sessionId = await resolveSshSessionId(ctx);
        const sftp = await ensureSftp(ctx.sessions, sessionId);
        if (isDirectory) {
          await promisify((cb) => sftp.rmdir(remotePath, cb));
        } else {
          await promisify((cb) => sftp.unlink(remotePath, cb));
        }
        return { ok: true, data: { remotePath, isDirectory, riskLevel: risk } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  return [sftpWrite, sftpUpload, sftpDelete];
}

module.exports = { createSftpWriteTools };
