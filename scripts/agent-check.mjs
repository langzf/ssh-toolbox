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

const L7_FILES = [
  ...L6_FILES,
  'main/k8s.js',
  'src/k8s-ui.js',
  'main/agent/tools/k8s-read.js',
  'main/agent/tools/k8s-read.test.js',
];

const L8_FILES = [
  ...L7_FILES,
  'main/agent/tools/k8s-write.js',
  'main/agent/tools/k8s-write.test.js',
  'main/agent/channel-adapter.js',
  'main/agent/skills/catalog.js',
  'main/agent/skills/catalog.test.js',
  'main/agent/skills/loader.js',
  'main/agent/skills/loader.test.js',
  'main/agent/tools/skills.js',
  'main/agent/tools/skills.test.js',
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

function checkL7K8sTools() {
  const toolsPath = path.join(root, 'main/agent/tools/k8s-read.js');
  const src = existsSync(toolsPath) ? readFileSync(toolsPath, 'utf8') : '';
  const required = [
    'k8s.list_clusters',
    'k8s.list_namespaces',
    'k8s.list_pods',
    'k8s.pod_logs',
    'k8s.metrics',
  ];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L7 k8s tools:', missing.join(', '));
    process.exit(1);
  }
}

function checkL7Main() {
  const mainPath = path.join(root, 'main/main.js');
  const src = existsSync(mainPath) ? readFileSync(mainPath, 'utf8') : '';
  if (!src.includes('registerK8sIpc')) {
    console.error('Missing L7 main wiring: registerK8sIpc');
    process.exit(1);
  }
  const indexPath = path.join(root, 'main/agent/tools/index.js');
  const indexSrc = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
  if (!indexSrc.includes('createK8sReadTools')) {
    console.error('Missing L7 registry: createK8sReadTools');
    process.exit(1);
  }
}

function checkL7PreloadExports() {
  const preloadPath = path.join(root, 'main/preload.js');
  const src = existsSync(preloadPath) ? readFileSync(preloadPath, 'utf8') : '';
  const required = ['k8sListClusters:', 'k8sListPods:', 'k8sFetchLogs:', 'k8sFetchMetrics:'];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L7 preload exports:', missing.join(', '));
    process.exit(1);
  }
}

function checkL7HtmlIds() {
  const htmlPath = path.join(root, 'src/index.html');
  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';
  const required = [
    'data-view="k8s"',
    'k8s-browser',
    'k8s-workbench',
    'k8s-ui.js',
    'agent-target-type',
    'agent-k8s-cluster-select',
  ];
  const missing = required.filter((id) => !html.includes(id));
  if (missing.length) {
    console.error('Missing L7 HTML markers:', missing.join(', '));
    process.exit(1);
  }
}

function checkL7AgentUi() {
  const uiPath = path.join(root, 'src/agent-ui.js');
  const src = existsSync(uiPath) ? readFileSync(uiPath, 'utf8') : '';
  const required = ['agent-k8s-cluster-select', "type: 'k8s'", 'k8sListClusters'];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L7 agent-ui K8s binding:', missing.join(', '));
    process.exit(1);
  }
}

function checkL7Renderer() {
  const rendererPath = path.join(root, 'src/renderer.js');
  const src = existsSync(rendererPath) ? readFileSync(rendererPath, 'utf8') : '';
  const required = ['LocalWebSSHK8s', 'createK8sModule', 'k8s-workbench'];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L7 renderer wiring:', missing.join(', '));
    process.exit(1);
  }
}

function checkL7K8sExports() {
  const k8sPath = path.join(root, 'main/k8s.js');
  const src = existsSync(k8sPath) ? readFileSync(k8sPath, 'utf8') : '';
  const required = ['listClusters', 'listNamespaces', 'listPods', 'readPodLogs', 'fetchPodMetrics', 'apiListItems'];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L7 k8s exports:', missing.join(', '));
    process.exit(1);
  }
}

function checkL8K8sWriteTools() {
  const toolsPath = path.join(root, 'main/agent/tools/k8s-write.js');
  const src = existsSync(toolsPath) ? readFileSync(toolsPath, 'utf8') : '';
  const required = ['k8s.pod_exec', 'k8s.delete_pod', "RISK.WRITE", "RISK.DANGER"];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L8 k8s write tools:', missing.join(', '));
    process.exit(1);
  }
}

function checkL8ChannelAdapter() {
  const adapterPath = path.join(root, 'main/agent/channel-adapter.js');
  const src = existsSync(adapterPath) ? readFileSync(adapterPath, 'utf8') : '';
  const required = ['createNoopChannelAdapter', '远程通道未启用（二期）', "return 'deny'"];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L8 channel adapter:', missing.join(', '));
    process.exit(1);
  }
}

function checkL8Registry() {
  const indexPath = path.join(root, 'main/agent/tools/index.js');
  const src = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
  if (!src.includes('createK8sWriteTools')) {
    console.error('Missing L8 registry: createK8sWriteTools');
    process.exit(1);
  }
  if (!src.includes('createSkillTools')) {
    console.error('Missing L8 registry: createSkillTools');
    process.exit(1);
  }
}

function checkL8K8sExports() {
  const k8sPath = path.join(root, 'main/k8s.js');
  const src = existsSync(k8sPath) ? readFileSync(k8sPath, 'utf8') : '';
  const required = ['execPodCommand', 'deletePod'];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L8 k8s exports:', missing.join(', '));
    process.exit(1);
  }
}

function checkL8Runtime() {
  const ipcPath = path.join(root, 'main/agent/ipc.js');
  const src = existsSync(ipcPath) ? readFileSync(ipcPath, 'utf8') : '';
  const required = ['createNoopChannelAdapter', 'channelAdapter'];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L8 runtime wiring:', missing.join(', '));
    process.exit(1);
  }
}

function checkL8Readme() {
  const readmePath = path.join(root, 'README.md');
  const src = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : '';
  const required = ['Agent', 'Base URL', 'API Key'];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length) {
    console.error('Missing L8 README Agent section:', missing.join(', '));
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
} else if (layer === 7) {
  checkFiles(L7_FILES);
  checkPreloadExports();
  checkL3PreloadExports();
  checkL4PreloadExports();
  checkL7PreloadExports();
  checkHtmlIds();
  checkL3HtmlIds();
  checkL4HtmlIds();
  checkL6HtmlIds();
  checkL7HtmlIds();
  checkL6AgentUi();
  checkL7AgentUi();
  checkL6Renderer();
  checkL7Renderer();
  checkL4Ipc();
  checkL7Main();
  checkL7K8sTools();
  checkL7K8sExports();
  runTests(
    'main/agent/llm-client.test.js',
    'main/agent/sessions.test.js',
    'main/agent/policy.test.js',
    'main/agent/runtime.test.js',
    'main/agent/confirm.test.js',
    'main/agent/tools/k8s-read.test.js'
  );
  console.log('L7 OK');
} else if (layer === 8) {
  checkFiles(L8_FILES);
  checkPreloadExports();
  checkL3PreloadExports();
  checkL4PreloadExports();
  checkL7PreloadExports();
  checkHtmlIds();
  checkL3HtmlIds();
  checkL4HtmlIds();
  checkL6HtmlIds();
  checkL7HtmlIds();
  checkL6AgentUi();
  checkL7AgentUi();
  checkL6Renderer();
  checkL7Renderer();
  checkL4Ipc();
  checkL7Main();
  checkL7K8sTools();
  checkL7K8sExports();
  checkL8K8sWriteTools();
  checkL8ChannelAdapter();
  checkL8Registry();
  checkL8K8sExports();
  checkL8Runtime();
  checkL8Readme();
  runTests(
    'main/agent/llm-client.test.js',
    'main/agent/sessions.test.js',
    'main/agent/policy.test.js',
    'main/agent/runtime.test.js',
    'main/agent/confirm.test.js',
    'main/agent/tools/k8s-read.test.js',
    'main/agent/tools/k8s-write.test.js',
    'main/agent/skills/catalog.test.js',
    'main/agent/skills/loader.test.js',
    'main/agent/tools/skills.test.js'
  );
  console.log('L8 OK');
} else {
  console.error(`Unknown or unsupported layer: ${layer}`);
  process.exit(1);
}
