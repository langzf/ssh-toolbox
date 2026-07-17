#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const L1_FILES = [
  'main/agent/types.js',
  'main/agent/settings.js',
  'main/agent/llm-client.js',
  'main/agent/llm-client.test.js',
  'main/agent/ipc.js',
];

function parseLayer(argv) {
  const arg = argv.find((a) => a.startsWith('--layer='));
  return arg ? Number(arg.split('=')[1]) : 1;
}

function checkFiles(files) {
  const missing = files.filter((f) => !existsSync(path.join(root, f)));
  if (missing.length) {
    console.error('Missing files:', missing.join(', '));
    process.exit(1);
  }
}

function runTests() {
  const result = spawnSync('node', ['--test', 'main/agent/llm-client.test.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const layer = parseLayer(process.argv.slice(2));

if (layer === 1) {
  checkFiles(L1_FILES);
  runTests();
  console.log('L1 OK');
} else {
  console.error(`Unknown or unsupported layer: ${layer}`);
  process.exit(1);
}
