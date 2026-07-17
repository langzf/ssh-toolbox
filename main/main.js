const electron = require('electron');
if (typeof electron === 'string' || !electron.app) {
  throw new Error(
    'Electron API 未加载。请执行: unset ELECTRON_RUN_AS_NODE && npm start'
  );
}
const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Client } = require('ssh2');
const Store = require('electron-store');
const { registerSftpIpc } = require('./sftp');
const { registerMetricsIpc } = require('./metrics');
const { registerAgentIpc } = require('./agent/ipc');

const store = new Store({ name: 'connections' });
const snippetStore = new Store({ name: 'snippets' });
const settingsStore = new Store({ name: 'settings' });
const credentialStore = new Store({ name: 'credentials' });
const sessions = new Map();

function encryptSecret(text) {
  if (!text) return null;
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text).toString('base64');
  }
  return Buffer.from(text, 'utf8').toString('base64');
}

function decryptSecret(encoded) {
  if (!encoded) return null;
  const buf = Buffer.from(encoded, 'base64');
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buf);
  }
  return buf.toString('utf8');
}
let mainWindow = null;

const DEFAULT_SETTINGS = {
  defaultPort: 22,
  fontSize: 13,
  themeId: 'default',
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#dce6f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  if (process.env.LOCAL_WEBSSH_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function readPrivateKey(filePath) {
  if (!filePath || !String(filePath).trim()) return undefined;
  const resolved = filePath.startsWith('~')
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath;
  try {
    return fs.readFileSync(resolved);
  } catch (err) {
    throw new Error(`无法读取私钥 (${resolved}): ${err.message}`);
  }
}

function defaultPrivateKeyPaths() {
  const sshDir = path.join(os.homedir(), '.ssh');
  return ['id_ed25519', 'id_rsa', 'id_ecdsa'].map((name) => path.join(sshDir, name));
}

function resolveAuth(config) {
  const connectConfig = {};
  if (config.password) connectConfig.password = config.password;

  let keyPath = config.privateKeyPath?.trim();
  if (!keyPath) {
    for (const candidate of defaultPrivateKeyPaths()) {
      if (fs.existsSync(candidate)) {
        keyPath = candidate;
        break;
      }
    }
  }

  if (keyPath) {
    connectConfig.privateKey = readPrivateKey(keyPath);
    if (config.passphrase) connectConfig.passphrase = config.passphrase;
  }

  return { connectConfig, keyPath };
}

ipcMain.handle('app-meta', () => ({
  username: os.userInfo().username,
  homedir: os.homedir(),
  settings: { ...DEFAULT_SETTINGS, ...settingsStore.store },
}));

ipcMain.handle('settings-save', (_event, settings) => {
  settingsStore.set({ ...DEFAULT_SETTINGS, ...settings });
  return settingsStore.store;
});

ipcMain.handle('pick-private-key', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 SSH 私钥',
    defaultPath: path.join(os.homedir(), '.ssh'),
    properties: ['openFile'],
    filters: [
      { name: '密钥文件', extensions: ['pem', 'key'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('connections-list', () => store.get('items', []));

ipcMain.handle('connections-save', (_event, items) => {
  if (!Array.isArray(items)) {
    throw new Error('连接列表格式无效');
  }
  store.set('items', items);
  return store.get('items', []);
});

ipcMain.handle('credential-get', (_event, connectionId) => {
  if (!connectionId) return null;
  const record = credentialStore.get(connectionId);
  if (!record) return null;
  try {
    return {
      password: decryptSecret(record.password) || '',
      passphrase: decryptSecret(record.passphrase) || '',
    };
  } catch (err) {
    credentialStore.delete(connectionId);
    return null;
  }
});

ipcMain.handle('credential-save', (_event, { connectionId, password, passphrase }) => {
  if (!connectionId) throw new Error('缺少 connectionId');
  if (!password && !passphrase) {
    credentialStore.delete(connectionId);
    return false;
  }
  credentialStore.set(connectionId, {
    password: password ? encryptSecret(password) : null,
    passphrase: passphrase ? encryptSecret(passphrase) : null,
  });
  return true;
});

ipcMain.handle('credential-delete', (_event, connectionId) => {
  if (connectionId) credentialStore.delete(connectionId);
  return true;
});

ipcMain.handle('snippets-list', () => snippetStore.get('items', []));

ipcMain.handle('snippets-save', (_event, items) => {
  if (!Array.isArray(items)) {
    throw new Error('片段列表格式无效');
  }
  snippetStore.set('items', items);
  return snippetStore.get('items', []);
});

ipcMain.handle('ssh-connect', async (_event, config) => {
  const {
    sessionId,
    host,
    port = 22,
    username,
    password,
    privateKeyPath,
    passphrase,
  } = config;

  if (!sessionId || !host?.trim() || !username?.trim()) {
    throw new Error('缺少主机名或用户名');
  }

  if (sessions.has(sessionId)) {
    throw new Error('会话已存在');
  }

  const { connectConfig, keyPath } = resolveAuth({ password, privateKeyPath, passphrase });

  if (!connectConfig.password && !connectConfig.privateKey) {
    throw new Error('请填写密码、选择私钥，或确保 ~/.ssh/id_ed25519 或 id_rsa 存在');
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    const base = {
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
      readyTimeout: 20000,
      keepaliveInterval: 10000,
      ...connectConfig,
    };

    conn
      .on('ready', () => {
        conn.shell({ term: 'xterm-256color', cols: 120, rows: 32 }, (err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }

          sessions.set(sessionId, { conn, stream });

          stream.on('data', (data) => {
            send('ssh-output', { sessionId, data: data.toString('utf8') });
          });

          stream.on('close', () => {
            send('ssh-closed', { sessionId });
            cleanupSession(sessionId);
          });

          stream.stderr.on('data', (data) => {
            send('ssh-output', { sessionId, data: data.toString('utf8') });
          });

          resolve({
            sessionId,
            host: base.host,
            port: base.port,
            username: base.username,
            usedKeyPath: keyPath || null,
          });
        });
      })
      .on('error', (err) => {
        cleanupSession(sessionId);
        const msg = err.message || String(err);
        if (/ECONNREFUSED/i.test(msg)) {
          reject(new Error(`无法连接 ${base.host}:${base.port}（连接被拒绝）。请确认 SSH 服务已开启。`));
        } else if (/ENOTFOUND/i.test(msg)) {
          reject(new Error(`找不到主机: ${base.host}`));
        } else if (/Authentication/i.test(msg) || /auth/i.test(msg)) {
          reject(new Error('认证失败：请检查用户名、密码或私钥'));
        } else {
          reject(new Error(msg));
        }
      })
      .connect(base);
  });
});

function cleanupSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  try {
    entry.stream?.end();
  } catch (_) {
    /* ignore */
  }
  try {
    entry.sftp?.end?.();
  } catch (_) {
    /* ignore */
  }
  try {
    entry.conn?.end();
  } catch (_) {
    /* ignore */
  }
  sessions.delete(sessionId);
}

registerSftpIpc(ipcMain, sessions, () => mainWindow);
registerMetricsIpc(ipcMain, sessions);
registerAgentIpc(ipcMain, { encryptSecret, decryptSecret });

ipcMain.handle('ssh-disconnect', (_event, sessionId) => {
  cleanupSession(sessionId);
  return true;
});

ipcMain.on('ssh-write', (_event, { sessionId, data }) => {
  const entry = sessions.get(sessionId);
  if (entry?.stream && !entry.stream.destroyed) {
    entry.stream.write(data);
  }
});

ipcMain.on('ssh-resize', (_event, { sessionId, cols, rows }) => {
  const entry = sessions.get(sessionId);
  if (entry?.stream?.setWindow) {
    entry.stream.setWindow(rows, cols);
  }
});

ipcMain.handle('open-external', (_event, url) => shell.openExternal(url));

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  for (const id of [...sessions.keys()]) cleanupSession(id);
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  for (const id of [...sessions.keys()]) cleanupSession(id);
});
