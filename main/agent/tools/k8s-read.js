const { RISK } = require('../types');

function resolveK8sTarget(ctx) {
  const targets = ctx.agentSession?.targets || [];
  const k8sTarget = targets.find((t) => t.type === 'k8s' && t.clusterId);
  if (!k8sTarget) {
    throw new Error('未绑定 K8s 集群，请先在 Agent 工作台选择目标集群');
  }
  return k8sTarget;
}

function resolveNamespace(args, target) {
  const ns = String(args.namespace || target.namespace || 'default').trim();
  if (!ns) throw new Error('缺少 namespace');
  return ns;
}

function createK8sReadTools(k8sApi = require('../../k8s')) {
  const listClusters = {
    name: 'k8s.list_clusters',
    description: '列出已保存的 Kubernetes 集群',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      try {
        const clusters = k8sApi.listClusters().map((c) => ({
          id: c.id,
          name: c.name,
          defaultContext: c.defaultContext || null,
          hasPrometheus: Boolean(c.prometheusUrl?.trim()),
        }));
        return { ok: true, data: { clusters } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  const listNamespaces = {
    name: 'k8s.list_namespaces',
    description: '列出集群中的命名空间',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        clusterId: { type: 'string', description: '集群 ID（未绑定时必填）' },
        context: { type: 'string', description: 'kubeconfig 上下文，可选' },
      },
    },
    async execute(args, ctx) {
      try {
        const target = ctx.agentSession?.targets?.find((t) => t.type === 'k8s' && t.clusterId);
        const clusterId = args.clusterId || target?.clusterId;
        if (!clusterId) return { ok: false, error: '缺少 clusterId，请先绑定 K8s 集群' };
        const context = args.context || target?.context;
        const namespaces = await k8sApi.listNamespaces(clusterId, context);
        return { ok: true, data: { clusterId, context: context || null, namespaces } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  const listPods = {
    name: 'k8s.list_pods',
    description: '列出指定命名空间中的 Pod',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: '命名空间，默认 default 或绑定目标中的命名空间' },
        clusterId: { type: 'string', description: '集群 ID（未绑定时必填）' },
        context: { type: 'string', description: 'kubeconfig 上下文，可选' },
      },
    },
    async execute(args, ctx) {
      try {
        const target = resolveK8sTarget(ctx);
        const clusterId = args.clusterId || target.clusterId;
        const context = args.context || target.context;
        const namespace = resolveNamespace(args, target);
        const pods = await k8sApi.listPods(clusterId, context, namespace);
        return { ok: true, data: { clusterId, namespace, pods } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  const podLogs = {
    name: 'k8s.pod_logs',
    description: '读取 Pod 容器日志（末尾若干行）',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: '命名空间' },
        podName: { type: 'string', description: 'Pod 名称' },
        container: { type: 'string', description: '容器名，多容器 Pod 必填' },
        tailLines: { type: 'number', description: '末尾行数，默认 200' },
        clusterId: { type: 'string', description: '集群 ID（未绑定时必填）' },
        context: { type: 'string', description: 'kubeconfig 上下文，可选' },
      },
      required: ['podName'],
    },
    async execute(args, ctx) {
      const podName = String(args.podName || '').trim();
      if (!podName) return { ok: false, error: '缺少 podName' };
      const tailLines = Math.min(Math.max(Number(args.tailLines) || 200, 1), 2000);

      try {
        const target = resolveK8sTarget(ctx);
        const clusterId = args.clusterId || target.clusterId;
        const context = args.context || target.context;
        const namespace = resolveNamespace(args, target);
        const cluster = k8sApi.findCluster(clusterId);
        let container = String(args.container || '').trim();
        if (!container) {
          const pods = await k8sApi.listPods(clusterId, context, namespace);
          const pod = pods.find((p) => p.name === podName);
          container = pod?.containers?.[0] || '';
        }
        if (!container) return { ok: false, error: '缺少 container，且无法从 Pod 推断' };

        const text = await k8sApi.readPodLogs(
          clusterId,
          context,
          namespace,
          podName,
          container,
          tailLines
        );
        const maxChars = 64000;
        const truncated = text.length > maxChars;
        return {
          ok: true,
          data: {
            cluster: cluster?.name || clusterId,
            namespace,
            podName,
            container,
            tailLines,
            text: truncated ? text.slice(-maxChars) : text,
            truncated,
          },
        };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  const metrics = {
    name: 'k8s.metrics',
    description: '获取命名空间内 Pod/节点资源指标（metrics-server 或 Prometheus）',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: '命名空间，默认 default 或绑定目标中的命名空间' },
        clusterId: { type: 'string', description: '集群 ID（未绑定时必填）' },
        context: { type: 'string', description: 'kubeconfig 上下文，可选' },
      },
    },
    async execute(args, ctx) {
      try {
        const target = resolveK8sTarget(ctx);
        const clusterId = args.clusterId || target.clusterId;
        const context = args.context || target.context;
        const namespace = resolveNamespace(args, target);
        const data = await k8sApi.fetchPodMetrics(clusterId, context, namespace);
        return { ok: true, data: { clusterId, namespace, ...data } };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  return [listClusters, listNamespaces, listPods, podLogs, metrics];
}

module.exports = { createK8sReadTools, resolveK8sTarget, resolveNamespace };
