const fs = require('fs');
const path = require('path');

const METRICS_SCRIPT_B64 = fs.readFileSync(path.join(__dirname, 'metrics-collect.py')).toString('base64');

function execOnSession(sessions, sessionId, command, timeoutMs = 20000) {
  const entry = sessions.get(sessionId);
  if (!entry?.conn) throw new Error('会话不存在或已断开');

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => reject(new Error('采集超时')), timeoutMs);

    entry.conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }

      stream.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });
      stream.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });
      stream.on('close', (code) => {
        clearTimeout(timer);
        const out = stdout.trim();
        if (!out && code !== 0) {
          reject(new Error(stderr.trim() || `远程命令失败 (${code})`));
          return;
        }
        resolve(out);
      });
    });
  });
}

function buildMetricsCommand() {
  const b64 = METRICS_SCRIPT_B64.replace(/'/g, "'\\''");
  return `bash -lc 'echo "${b64}" | base64 -d | python3 2>/dev/null || echo "${b64}" | base64 -d | python 2>/dev/null || echo "{\\"error\\":\\"远程主机需要 python3（apt/yum install python3）\\"}"'`;
}

function parseMetricsOutput(raw) {
  const line = raw.split('\n').find((l) => l.trim().startsWith('{')) || raw.trim();
  const data = JSON.parse(line);
  if (!data.cpu) data.cpu = { percent: 0 };
  if (!data.memory) data.memory = { total: 0, used: 0, percent: 0 };
  if (!data.disks) data.disks = [];
  if (!data.gpus) data.gpus = [];
  if (!data.load) data.load = [0, 0, 0];
  return data;
}

function registerMetricsIpc(ipcMain, sessions) {
  ipcMain.handle('metrics-fetch', async (_event, { sessionId }) => {
    const raw = await execOnSession(sessions, sessionId, buildMetricsCommand(), 25000);
    return parseMetricsOutput(raw);
  });
}

module.exports = { registerMetricsIpc, execOnSession };
