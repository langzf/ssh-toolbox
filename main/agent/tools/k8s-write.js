const { RISK } = require('../types');
const { resolveK8sTarget, resolveNamespace } = require('./k8s-read');

async function resolveContainer(args, k8sApi, clusterId, context, namespace, podName) {
  let container = String(args.container || '').trim();
  if (container) return container;
  const pods = await k8sApi.listPods(clusterId, context, namespace);
  const pod = pods.find((p) => p.name === podName);
  container = pod?.containers?.[0] || '';
  if (!container) throw new Error('缺少 container，且无法从 Pod 推断');
  return container;
}

function createK8sWriteTools(k8sApi = require('../../k8s')) {
  const podExec = {
    name: 'k8s.pod_exec',
    description: '在 Pod 容器内执行命令并返回输出（非交互式，需确认）',
    riskLevel: RISK.WRITE,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: '命名空间' },
        podName: { type: 'string', description: 'Pod 名称' },
        container: { type: 'string', description: '容器名，多容器 Pod 必填' },
        command: {
          type: 'string',
          description: 'Shell 命令字符串，或 JSON 数组形式的 argv（如 ["ls","-la"]）',
        },
        timeoutMs: { type: 'number', description: '超时毫秒，默认 20000' },
        clusterId: { type: 'string', description: '集群 ID（未绑定时必填）' },
        context: { type: 'string', description: 'kubeconfig 上下文，可选' },
      },
      required: ['podName', 'command'],
    },
    async execute(args, ctx) {
      const podName = String(args.podName || '').trim();
      if (!podName) return { ok: false, error: '缺少 podName' };

      let command = args.command;
      if (typeof command === 'string' && command.trim().startsWith('[')) {
        try {
          command = JSON.parse(command);
        } catch (_) {
          /* keep as shell string */
        }
      }
      if (!command) return { ok: false, error: '缺少 command' };

      try {
        const target = resolveK8sTarget(ctx);
        const clusterId = args.clusterId || target.clusterId;
        const context = args.context || target.context;
        const namespace = resolveNamespace(args, target);
        const container = await resolveContainer(args, k8sApi, clusterId, context, namespace, podName);
        const timeoutMs = Math.min(Math.max(Number(args.timeoutMs) || 20000, 1000), 120000);
        const cluster = k8sApi.findCluster(clusterId);
        const result = await k8sApi.execPodCommand(
          clusterId,
          context,
          namespace,
          podName,
          container,
          command,
          timeoutMs
        );
        return {
          ok: true,
          data: {
            cluster: cluster?.name || clusterId,
            namespace,
            podName,
            container,
            ...result,
          },
        };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  const deletePodTool = {
    name: 'k8s.delete_pod',
    description: '删除命名空间中的 Pod（高危，需确认）',
    riskLevel: RISK.DANGER,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: '命名空间' },
        podName: { type: 'string', description: 'Pod 名称' },
        clusterId: { type: 'string', description: '集群 ID（未绑定时必填）' },
        context: { type: 'string', description: 'kubeconfig 上下文，可选' },
      },
      required: ['podName'],
    },
    async execute(args, ctx) {
      const podName = String(args.podName || '').trim();
      if (!podName) return { ok: false, error: '缺少 podName' };

      try {
        const target = resolveK8sTarget(ctx);
        const clusterId = args.clusterId || target.clusterId;
        const context = args.context || target.context;
        const namespace = resolveNamespace(args, target);
        const cluster = k8sApi.findCluster(clusterId);
        const result = await k8sApi.deletePod(clusterId, context, namespace, podName);
        return {
          ok: true,
          data: { cluster: cluster?.name || clusterId, ...result },
        };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  return [podExec, deletePodTool];
}

module.exports = { createK8sWriteTools };
