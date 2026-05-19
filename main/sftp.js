const path = require('path');
const { dialog } = require('electron');
const { posix } = require('path');

function promisify(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function joinRemote(dir, name) {
  if (!dir || dir === '/') return `/${name}`;
  return `${dir.replace(/\/$/, '')}/${name}`;
}

function parentRemote(dir) {
  if (!dir || dir === '/') return '/';
  const parts = dir.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
}

function ensureSftp(sessions, sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry?.conn) throw new Error('会话不存在或已断开');
  if (entry.sftp) return Promise.resolve(entry.sftp);
  return promisify((cb) => entry.conn.sftp(cb)).then((sftp) => {
    entry.sftp = sftp;
    return sftp;
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

function registerSftpIpc(ipcMain, sessions, getMainWindow) {
  ipcMain.handle('sftp-home', async (_event, { sessionId }) => {
    const sftp = await ensureSftp(sessions, sessionId);
    try {
      return await promisify((cb) => sftp.realpath('.', cb));
    } catch {
      try {
        return await promisify((cb) => sftp.realpath('~', cb));
      } catch {
        return '/';
      }
    }
  });

  ipcMain.handle('sftp-list', async (_event, { sessionId, remotePath }) => {
    const sftp = await ensureSftp(sessions, sessionId);
    const dir = remotePath || '/';
    const list = await promisify((cb) => sftp.readdir(dir, cb));
    return list
      .map(mapDirEntry)
      .filter((item) => item.name !== '.' && item.name !== '..')
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
  });

  ipcMain.handle('sftp-mkdir', async (_event, { sessionId, remotePath }) => {
    const sftp = await ensureSftp(sessions, sessionId);
    await promisify((cb) => sftp.mkdir(remotePath, cb));
    return true;
  });

  ipcMain.handle('sftp-delete', async (_event, { sessionId, remotePath, isDirectory }) => {
    const sftp = await ensureSftp(sessions, sessionId);
    if (isDirectory) {
      await promisify((cb) => sftp.rmdir(remotePath, cb));
    } else {
      await promisify((cb) => sftp.unlink(remotePath, cb));
    }
    return true;
  });

  ipcMain.handle('sftp-download', async (_event, { sessionId, remotePath, fileName }) => {
    const win = getMainWindow();
    const result = await dialog.showSaveDialog(win, {
      title: '保存到本机',
      defaultPath: fileName || path.basename(remotePath),
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const sftp = await ensureSftp(sessions, sessionId);
    await promisify((cb) => sftp.fastGet(remotePath, result.filePath, cb));
    return { canceled: false, localPath: result.filePath };
  });

  ipcMain.handle('sftp-upload', async (_event, { sessionId, remoteDir }) => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win, {
      title: '选择要上传的文件',
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true, uploaded: [] };

    const sftp = await ensureSftp(sessions, sessionId);
    const uploaded = [];
    for (const localPath of result.filePaths) {
      const base = path.basename(localPath);
      const remotePath = joinRemote(remoteDir || '/', base);
      await promisify((cb) => sftp.fastPut(localPath, remotePath, cb));
      uploaded.push({ localPath, remotePath });
    }
    return { canceled: false, uploaded };
  });
}

module.exports = {
  registerSftpIpc,
  joinRemote,
  parentRemote,
  ensureSftp,
};
