#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [appRoot], {
  stdio: 'inherit',
  env,
  cwd: appRoot,
});

child.on('close', (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('无法启动 SSH 工具箱:', err.message);
  process.exit(1);
});
