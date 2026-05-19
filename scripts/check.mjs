#!/usr/bin/env node
/**
 * 本地自检：依赖、存储、SSH 端口探测
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createConnection } from 'net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const required = [
  'node_modules/@xterm/xterm/lib/xterm.js',
  'node_modules/@xterm/addon-fit/lib/addon-fit.js',
  'node_modules/ssh2/package.json',
  'node_modules/electron/package.json',
  'main/main.js',
  'main/preload.js',
  'src/renderer.js',
  'src/index.html',
];

let failed = false;

for (const rel of required) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error('缺少文件:', rel);
    failed = true;
  }
}

function probePort(host, port, ms = 2000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, ms);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

const sshUp = await probePort('127.0.0.1', 22);
console.log(sshUp ? '✓ 本机 22 端口可连接（SSH 可能已开启）' : '⚠ 本机 22 端口未监听（连接前请在系统设置中开启「远程登录」）');

if (failed) {
  console.error('\n自检失败，请运行: cd LocalWebSSH && npm install');
  process.exit(1);
}

// 验证 FitAddon UMD 导出形态
const fitCode = fs.readFileSync(path.join(root, 'node_modules/@xterm/addon-fit/lib/addon-fit.js'), 'utf8');
if (!fitCode.includes('FitAddon')) {
  console.error('FitAddon 脚本异常');
  failed = true;
}

console.log('✓ 项目文件与依赖完整');
process.exit(failed ? 1 : 0);
