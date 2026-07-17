const path = require('path');
const fs = require('fs');
const os = require('os');
const { PassThrough } = require('stream');
const Store = require('electron-store');
const { dialog } = require('electron');

const clusterStore = new Store({ name: 'k8s-clusters' });
const clientCache = new Map();
const execSessions = new Map();
const logStreams = new Map();

let k8sModulePromise;

async function loadK8s() {
  if (!k8sModulePromise) {
    k8sModulePromise = import('@kubernetes/client-node');
  }
  return k8sModulePromise;
}

function uid(prefix = 'k8s') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function listClusters() {
  const items = clusterStore.get('items');
  return Array.isArray(items) ? items : [];
}

function saveClusters(items) {
  clusterStore.set('items', items);
  return items;
}

function findCluster(clusterId) {
  return listClusters().find((c) => c.id === clusterId) || null;
}

function cacheKey(clusterId, context) {
  return `${clusterId}::${context || ''}`;
}

function invalidateClusterCache(clusterId) {
  for (const key of [...clientCache.keys()]) {
    if (key.startsWith(`${clusterId}::`)) clientCache.delete(key);
  }
}

async function buildKubeConfig(cluster, contextName) {
  const k8s = await loadK8s();
  const kc = new k8s.KubeConfig();
  kc.loadFromString(cluster.kubeconfigYaml);
  const ctx = contextName || cluster.defaultContext;
  if (ctx) kc.setCurrentContext(ctx);
  return { k8s, kc };
}

async function getClient(clusterId, contextName) {
  const cluster = findCluster(clusterId);
  if (!cluster?.kubeconfigYaml) {
    throw new Error('未找到集群或 kubeconfig 为空');
  }
  const ctx = contextName || cluster.defaultContext || '';
  const key = cacheKey(clusterId, ctx);
  if (clientCache.has(key)) return clientCache.get(key);

  const { k8s, kc } = await buildKubeConfig(cluster, contextName || cluster.defaultContext);
  const core = kc.makeApiClient(k8s.CoreV1Api);
  const entry = { k8s, kc, core, cluster, context: kc.getCurrentContext() };
  clientCache.set(key, entry);
  return entry;
}

async function parseContexts(kubeconfigYaml) {
  const { k8s, kc } = await (async () => {
    const mod = await loadK8s();
    const cfg = new mod.KubeConfig();
    cfg.loadFromString(kubeconfigYaml);
    return { k8s: mod, kc: cfg };
  })();
  const contexts = kc.getContexts().map((c) => ({
    name: c.name,
    cluster: c.cluster,
    user: c.user,
    namespace: c.namespace,
  }));
  return {
    contexts,
    current: kc.getCurrentContext(),
    clusters: kc.getClusters().map((c) => c.name),
  };
}

function formatK8sError(err) {
  if (!err) return '未知错误';
  if (err.body?.message) return err.body.message;
  if (err.response?.body?.message) return err.response.body.message;
  return err.message || String(err);
}

/** @kubernetes/client-node v1 直接返回列表；旧版包装在 .body */
function apiListItems(response) {
  if (!response) return [];
  const list = response.body != null ? response.body : response;
  return Array.isArray(list.items) ? list.items : [];
}

async function testKubeconfig(yaml, contextName) {
  if (!yaml?.trim()) {
    throw new Error('kubeconfig 为空');
  }
  const { k8s, kc } = await buildKubeConfig({ kubeconfigYaml: yaml }, contextName);
  const versionApi = kc.makeApiClient(k8s.VersionApi);
  const ver = await versionApi.getCode();
  return {
    ok: true,
    context: kc.getCurrentContext(),
    version: ver,
  };
}

async function testClusterConnection(clusterId, contextName) {
  const cluster = findCluster(clusterId);
  if (!cluster?.kubeconfigYaml) {
    throw new Error('未找到集群或 kubeconfig 为空');
  }
  return testKubeconfig(cluster.kubeconfigYaml, contextName || cluster.defaultContext);
}

async function listNamespaces(clusterId, contextName) {
  const { core } = await getClient(clusterId, contextName);
  const res = await core.listNamespace();
  return apiListItems(res)
    .map((ns) => ({
      name: ns.metadata?.name,
      status: ns.status?.phase,
    }))
    .filter((n) => n.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function listPods(clusterId, contextName, namespace) {
  const { core } = await getClient(clusterId, contextName);
  const res = await core.listNamespacedPod({ namespace });
  return apiListItems(res).map((pod) => {
    const containers = (pod.spec?.containers || []).map((c) => c.name);
    const statuses = pod.status?.containerStatuses || [];
    const ready = statuses.filter((s) => s.ready).length;
    return {
      name: pod.metadata?.name,
      namespace: pod.metadata?.namespace,
      phase: pod.status?.phase,
      node: pod.spec?.nodeName,
      startTime: pod.status?.startTime,
      containers,
      ready: `${ready}/${containers.length}`,
      restartCount: statuses.reduce((n, s) => n + (s.restartCount || 0), 0),
    };
  });
}

async function readPodLogs(clusterId, contextName, namespace, podName, container, tailLines = 200) {
  const { k8s, kc } = await getClient(clusterId, contextName);
  const logApi = new k8s.Log(kc);
  const out = new PassThrough();
  const chunks = [];
  out.on('data', (buf) => chunks.push(buf));
  await new Promise((resolve, reject) => {
    out.once('end', resolve);
    out.once('error', reject);
    logApi
      .log(namespace, podName, container, out, { follow: false, tailLines })
      .catch(reject);
  });
  return Buffer.concat(chunks).toString('utf8');
}

function stopLogStream(streamId) {
  const entry = logStreams.get(streamId);
  if (!entry) return;
  try {
    entry.controller?.abort?.();
  } catch (_) {
    /* ignore */
  }
  try {
    entry.out?.end?.();
  } catch (_) {
    /* ignore */
  }
  logStreams.delete(streamId);
}

async function startLogStream(clusterId, contextName, namespace, podName, container, tailLines, send) {
  const streamId = uid('log');
  const { k8s, kc } = await getClient(clusterId, contextName);
  const logApi = new k8s.Log(kc);
  const out = new PassThrough();
  out.on('data', (buf) => {
    send('k8s-log-chunk', { streamId, data: buf.toString('utf8') });
  });
  out.on('end', () => {
    send('k8s-log-end', { streamId });
    stopLogStream(streamId);
  });
  out.on('error', (err) => {
    send('k8s-log-error', { streamId, error: err.message });
    stopLogStream(streamId);
  });

  const controller = await logApi.log(namespace, podName, container, out, {
    follow: true,
    tailLines: tailLines || 200,
  });
  logStreams.set(streamId, { controller, out });
  return streamId;
}

function cleanupExecSession(execId) {
  const entry = execSessions.get(execId);
  if (!entry) return;
  try {
    entry.stdin?.end?.();
  } catch (_) {
    /* ignore */
  }
  try {
    entry.conn?.close?.();
  } catch (_) {
    /* ignore */
  }
  execSessions.delete(execId);
}

async function startExec(clusterId, contextName, namespace, podName, container, cols, rows, send) {
  const execId = uid('exec');
  const { k8s, kc } = await getClient(clusterId, contextName);
  const execApi = new k8s.Exec(kc);

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();

  stdout.on('data', (buf) => {
    send('k8s-exec-output', { execId, data: buf.toString('utf8') });
  });
  stderr.on('data', (buf) => {
    send('k8s-exec-output', { execId, data: buf.toString('utf8') });
  });

  const shell = ['/bin/sh'];
  const conn = await execApi.exec(
    namespace,
    podName,
    container,
    shell,
    stdout,
    stderr,
    stdin,
    true,
    (status) => {
      send('k8s-exec-closed', { execId, status });
      cleanupExecSession(execId);
    }
  );

  execSessions.set(execId, { stdin, conn, execApi });
  if (cols && rows && execApi.terminalSizeQueue) {
    execApi.terminalSizeQueue.resize(cols, rows);
  }
  return execId;
}

function parseCpuQuantity(q) {
  if (!q) return 0;
  const s = String(q);
  if (s.endsWith('n')) return Number(s.slice(0, -1)) / 1e9;
  if (s.endsWith('m')) return Number(s.slice(0, -1)) / 1000;
  return Number(s) || 0;
}

function parseMemQuantity(q) {
  if (!q) return 0;
  const s = String(q);
  const units = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
  };
  for (const [suffix, mult] of Object.entries(units)) {
    if (s.endsWith(suffix)) return Number(s.slice(0, -suffix.length)) * mult;
  }
  return Number(s) || 0;
}

async function fetchMetricsApi(clusterId, contextName, namespace) {
  const { k8s, kc, core } = await getClient(clusterId, contextName);
  const metrics = new k8s.Metrics(kc);
  const podRes = await metrics.getPodMetrics(namespace);
  const nodeRes = await metrics.getNodeMetrics();

  const pods = (podRes.items || []).map((item) => {
    const cpu = (item.containers || []).reduce((n, c) => n + parseCpuQuantity(c.usage?.cpu), 0);
    const mem = (item.containers || []).reduce((n, c) => n + parseMemQuantity(c.usage?.memory), 0);
    return {
      name: item.metadata?.name,
      cpuCores: cpu,
      memoryBytes: mem,
      containers: (item.containers || []).map((c) => ({
        name: c.name,
        cpu: parseCpuQuantity(c.usage?.cpu),
        memory: parseMemQuantity(c.usage?.memory),
      })),
    };
  });

  const nodes = (nodeRes.items || []).map((item) => ({
    name: item.metadata?.name,
    cpu: parseCpuQuantity(item.usage?.cpu),
    memory: parseMemQuantity(item.usage?.memory),
  }));

  let podLimits = {};
  try {
    const list = await core.listNamespacedPod({ namespace });
    for (const pod of apiListItems(list)) {
      const name = pod.metadata?.name;
      let cpuLim = 0;
      let memLim = 0;
      for (const c of pod.spec?.containers || []) {
        cpuLim += parseCpuQuantity(c.resources?.limits?.cpu);
        memLim += parseMemQuantity(c.resources?.limits?.memory);
      }
      podLimits[name] = { cpuLim, memLim };
    }
  } catch (_) {
    /* ignore */
  }

  for (const p of pods) {
    const lim = podLimits[p.name] || {};
    p.cpuLimit = lim.cpuLim || null;
    p.memoryLimit = lim.memLim || null;
    if (p.cpuLimit) p.cpuPercent = Math.min(100, (p.cpuCores / p.cpuLimit) * 100);
    if (p.memoryLimit) p.memoryPercent = Math.min(100, (p.memoryBytes / p.memoryLimit) * 100);
  }

  return { source: 'metrics-api', pods, nodes };
}

async function fetchPrometheusMetrics(prometheusUrl, namespace) {
  const base = prometheusUrl.replace(/\/$/, '');
  const queries = [
    {
      key: 'cpu',
      q: `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}",container!=""}[2m])) by (pod)`,
    },
    {
      key: 'mem',
      q: `sum(container_memory_working_set_bytes{namespace="${namespace}",container!=""}) by (pod)`,
    },
  ];
  const pods = {};
  for (const { key, q } of queries) {
    const url = `${base}/api/v1/query?query=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Prometheus 请求失败: ${res.status}`);
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.error || 'Prometheus 查询失败');
    for (const row of json.data?.result || []) {
      const podName = row.metric?.pod;
      if (!podName) continue;
      if (!pods[podName]) pods[podName] = { name: podName, containers: [] };
      const val = Number(row.value?.[1]) || 0;
      if (key === 'cpu') pods[podName].cpuCores = val;
      else pods[podName].memoryBytes = val;
    }
  }
  return {
    source: 'prometheus',
    pods: Object.values(pods),
    nodes: [],
  };
}

async function fetchPodMetrics(clusterId, contextName, namespace) {
  const cluster = findCluster(clusterId);
  try {
    return await fetchMetricsApi(clusterId, contextName, namespace);
  } catch (metricsErr) {
    if (cluster?.prometheusUrl?.trim()) {
      try {
        return await fetchPrometheusMetrics(cluster.prometheusUrl.trim(), namespace);
      } catch (promErr) {
        throw new Error(
          `Metrics API: ${formatK8sError(metricsErr)}；Prometheus: ${promErr.message}`
        );
      }
    }
    throw new Error(
      `无法获取指标（需集群安装 metrics-server 或在集群设置中填写 Prometheus 地址）: ${formatK8sError(metricsErr)}`
    );
  }
}

function registerK8sIpc(ipcMain, getMainWindow) {
  const send = (channel, payload) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  ipcMain.handle('k8s-clusters-list', () => listClusters());

  ipcMain.handle('k8s-clusters-save', (_event, items) => {
    if (!Array.isArray(items)) throw new Error('无效的集群列表');
    const saved = saveClusters(items);
    for (const c of saved) invalidateClusterCache(c.id);
    return saved;
  });

  ipcMain.handle('k8s-parse-contexts', async (_event, kubeconfigYaml) => {
    try {
      return await parseContexts(kubeconfigYaml);
    } catch (err) {
      throw new Error(`kubeconfig 解析失败: ${formatK8sError(err)}`);
    }
  });

  ipcMain.handle('k8s-pick-kubeconfig', async () => {
    const win = getMainWindow();
    const defaultPath = path.join(os.homedir(), '.kube', 'config');
    const result = await dialog.showOpenDialog(win, {
      title: '选择 kubeconfig',
      defaultPath: fs.existsSync(defaultPath) ? defaultPath : os.homedir(),
      properties: ['openFile'],
      filters: [{ name: 'Kubeconfig', extensions: ['yaml', 'yml', 'conf', ''] }],
    });
    if (result.canceled || !result.filePaths?.length) return null;
    const filePath = result.filePaths[0];
    const yaml = fs.readFileSync(filePath, 'utf8');
    return { filePath, yaml };
  });

  ipcMain.handle('k8s-test-connection', async (_event, { clusterId, context, kubeconfigYaml }) => {
    try {
      if (kubeconfigYaml?.trim()) {
        return await testKubeconfig(kubeconfigYaml, context);
      }
      return await testClusterConnection(clusterId, context);
    } catch (err) {
      throw new Error(formatK8sError(err));
    }
  });

  ipcMain.handle('k8s-list-namespaces', async (_event, { clusterId, context }) => {
    try {
      return await listNamespaces(clusterId, context);
    } catch (err) {
      throw new Error(formatK8sError(err));
    }
  });

  ipcMain.handle('k8s-list-pods', async (_event, { clusterId, context, namespace }) => {
    try {
      return await listPods(clusterId, context, namespace);
    } catch (err) {
      throw new Error(formatK8sError(err));
    }
  });

  ipcMain.handle('k8s-fetch-logs', async (_event, payload) => {
    try {
      const text = await readPodLogs(
        payload.clusterId,
        payload.context,
        payload.namespace,
        payload.podName,
        payload.container,
        payload.tailLines || 200
      );
      return { text };
    } catch (err) {
      throw new Error(formatK8sError(err));
    }
  });

  ipcMain.handle('k8s-logs-stream-start', async (_event, payload) => {
    try {
      const streamId = await startLogStream(
        payload.clusterId,
        payload.context,
        payload.namespace,
        payload.podName,
        payload.container,
        payload.tailLines,
        send
      );
      return { streamId };
    } catch (err) {
      throw new Error(formatK8sError(err));
    }
  });

  ipcMain.handle('k8s-logs-stream-stop', (_event, { streamId }) => {
    stopLogStream(streamId);
    return true;
  });

  ipcMain.handle('k8s-exec-start', async (_event, payload) => {
    try {
      const execId = await startExec(
        payload.clusterId,
        payload.context,
        payload.namespace,
        payload.podName,
        payload.container,
        payload.cols,
        payload.rows,
        send
      );
      return { execId };
    } catch (err) {
      throw new Error(formatK8sError(err));
    }
  });

  ipcMain.on('k8s-exec-write', (_event, { execId, data }) => {
    const entry = execSessions.get(execId);
    if (entry?.stdin && !entry.stdin.destroyed) entry.stdin.write(data);
  });

  ipcMain.on('k8s-exec-resize', (_event, { execId, cols, rows }) => {
    const entry = execSessions.get(execId);
    if (entry?.execApi?.terminalSizeQueue) {
      entry.execApi.terminalSizeQueue.resize(cols, rows);
    }
  });

  ipcMain.handle('k8s-exec-stop', (_event, { execId }) => {
    cleanupExecSession(execId);
    return true;
  });

  ipcMain.handle('k8s-fetch-metrics', async (_event, { clusterId, context, namespace }) => {
    try {
      return await fetchPodMetrics(clusterId, context, namespace);
    } catch (err) {
      throw new Error(err.message || formatK8sError(err));
    }
  });
}

module.exports = {
  registerK8sIpc,
  listClusters,
  findCluster,
  listNamespaces,
  listPods,
  readPodLogs,
  fetchPodMetrics,
  apiListItems,
};
