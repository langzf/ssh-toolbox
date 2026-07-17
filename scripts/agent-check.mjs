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

const L3_FILES = [
  ...L2_FILES,
  'main/agent/policy.js',
  'main/agent/policy.test.js',
  'main/agent/runtime.js',
  'main/agent/runtime.test.js',
  'main/agent/tools/registry.js',
  'main/agent/tools/index.js',
  'main/agent/tools/meta.js',
  'main/agent/tools/server.js',
  'main/agent/tools/ssh-read.js',
  'main/agent/tools/metrics-tool.js',
  'main/agent/tools/sftp-read.js',
];

const L4_FILES = [
  ...L3_FILES,
  'main/agent/confirm.js',
];

const L5_FILES = [
  ...L4_FILES,
  'main/agent/tools/ssh-write.js',
  'main/agent/tools/sftp-write.js',
];

const L6_FILES = [
  ...L5_FILES,
  'src/index.html',
  'src/renderer.js',
  'src/styles.css',
];

function checkL6HtmlIds() {
  const htmlPath = path.join(root, 'src/index.html');
  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';
  const required = ['btn-pane-agent', 'data-pane="agent"'];
  const missing = required.filter((id) => !html.includes(id));
  if (missing.length) {
    console.error('Missing L6 HTML markers:', missing.join(', '));
    process.exit(1);
  }
}

function checkL6AgentUi() {
  const uiPath = path.join(root, 'src/agent-ui.js');
  const src = existsSync(uiPath) ? readFileSync(uiPath, 'utf8') : '';
  const required = ['createSessionAgentPanel', 'onOpenInSidebar', 'sshSessionId'];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L6 agent-ui exports:', missing.join(', '));
    process.exit(1);
  }
}

function checkL6Renderer() {
  const rendererPath = path.join(root, 'src/renderer.js');
  const src = existsSync(rendererPath) ? readFileSync(rendererPath, 'utf8') : '';
  const required = ["setSessionPane(activeSessionId, 'agent')", 'createSessionAgentPanel', 'agentPanel'];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L6 renderer wiring:', missing.join(', '));
    process.exit(1);
  }
}

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

function checkL3PreloadExports() {
  const preloadPath = path.join(root, 'main/preload.js');
  const src = existsSync(preloadPath) ? readFileSync(preloadPath, 'utf8') : '';
  const required = ['agentSend:', 'agentSetTargets:'];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L3 preload exports:', missing.join(', '));
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

function checkL3HtmlIds() {
  const htmlPath = path.join(root, 'src/index.html');
  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';
  const required = ['agent-target-select'];
  const missing = required.filter((id) => !html.includes(id));
  if (missing.length) {
    console.error('Missing L3 HTML markers:', missing.join(', '));
    process.exit(1);
  }
}

function checkL4PreloadExports() {
  const preloadPath = path.join(root, 'main/preload.js');
  const src = existsSync(preloadPath) ? readFileSync(preloadPath, 'utf8') : '';
  const required = ['agentConfirmResponse:', 'onAgentConfirmRequest:'];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L4 preload exports:', missing.join(', '));
    process.exit(1);
  }
}

function checkL4HtmlIds() {
  const htmlPath = path.join(root, 'src/index.html');
  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';
  const required = ['agent-confirm-bar'];
  const missing = required.filter((id) => !html.includes(id));
  if (missing.length) {
    console.error('Missing L4 HTML markers:', missing.join(', '));
    process.exit(1);
  }
}

function checkL4Ipc() {
  const ipcPath = path.join(root, 'main/agent/ipc.js');
  const src = existsSync(ipcPath) ? readFileSync(ipcPath, 'utf8') : '';
  if (!src.includes('agent-confirm-response')) {
    console.error('Missing L4 IPC handler: agent-confirm-response');
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
} else if (layer === 3) {
  checkFiles(L3_FILES);
  checkPreloadExports();
  checkL3PreloadExports();
  checkHtmlIds();
  checkL3HtmlIds();
  runTests(
    'main/agent/llm-client.test.js',
    'main/agent/sessions.test.js',
    'main/agent/policy.test.js',
    'main/agent/runtime.test.js'
  );
  console.log('L3 OK');
} else if (layer === 4) {
  checkFiles(L4_FILES);
  checkPreloadExports();
  checkL3PreloadExports();
  checkL4PreloadExports();
  checkHtmlIds();
  checkL3HtmlIds();
  checkL4HtmlIds();
  checkL4Ipc();
  runTests(
    'main/agent/llm-client.test.js',
    'main/agent/sessions.test.js',
    'main/agent/policy.test.js',
    'main/agent/runtime.test.js',
    'main/agent/confirm.test.js'
  );
  console.log('L4 OK');
} else if (layer === 5) {
  checkFiles(L5_FILES);
  checkPreloadExports();
  checkL3PreloadExports();
  checkL4PreloadExports();
  checkHtmlIds();
  checkL3HtmlIds();
  checkL4HtmlIds();
  checkL4Ipc();
  runTests(
    'main/agent/llm-client.test.js',
    'main/agent/sessions.test.js',
    'main/agent/policy.test.js',
    'main/agent/runtime.test.js',
    'main/agent/confirm.test.js'
  );
  console.log('L5 OK');
} else if (layer === 6) {
  checkFiles(L6_FILES);
  checkPreloadExports();
  checkL3PreloadExports();
  checkL4PreloadExports();
  checkHtmlIds();
  checkL3HtmlIds();
  checkL4HtmlIds();
  checkL6HtmlIds();
  checkL6AgentUi();
  checkL6Renderer();
  checkL4Ipc();
  runTests(
    'main/agent/llm-client.test.js',
    'main/agent/sessions.test.js',
    'main/agent/policy.test.js',
    'main/agent/runtime.test.js',
    'main/agent/confirm.test.js'
  );
  console.log('L6 OK');
} else {
  console.error(`Unknown or unsupported layer: ${layer}`);
  process.exit(1);
}
