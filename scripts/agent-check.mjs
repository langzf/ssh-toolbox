#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
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

const L2_FILES = [
  ...L1_FILES,
  'main/agent/sessions.js',
  'main/agent/sessions.test.js',
  'src/agent-ui.js',
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

function runTests(...testFiles) {
  const result = spawnSync('node', ['--test', ...testFiles], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function checkPreloadExports() {
  const preloadPath = path.join(root, 'main/preload.js');
  const src = existsSync(preloadPath) ? readFileSync(preloadPath, 'utf8') : '';
  const required = [
    'agentListSessions',
    'agentCreateSession',
    'agentGetSession',
    'agentAppendMessage',
    'agentDeleteSession',
  ];
  const missing = required.filter((name) => !src.includes(`${name}:`));
  if (missing.length) {
    console.error('Missing preload exports:', missing.join(', '));
    process.exit(1);
  }
}

function checkHtmlIds() {
  const htmlPath = path.join(root, 'src/index.html');
  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';
  const required = ['agent-browser', 'agent-workbench', 'data-view="agent"', 'agent-ui.js'];
  const missing = required.filter((id) => !html.includes(id));
  if (missing.length) {
    console.error('Missing HTML markers:', missing.join(', '));
    process.exit(1);
  }
}

const layer = parseLayer(process.argv.slice(2));

if (layer === 1) {
  checkFiles(L1_FILES);
  runTests('main/agent/llm-client.test.js');
  console.log('L1 OK');
} else if (layer === 2) {
  checkFiles(L2_FILES);
  checkPreloadExports();
  checkHtmlIds();
  runTests('main/agent/llm-client.test.js', 'main/agent/sessions.test.js');
  console.log('L2 OK');
} else {
  console.error(`Unknown or unsupported layer: ${layer}`);
  process.exit(1);
}
