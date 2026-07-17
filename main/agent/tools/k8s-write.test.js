const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createK8sWriteTools } = require('./k8s-write');

const k8sCtx = {
  agentSession: {
    targets: [{ type: 'k8s', clusterId: 'c1', context: 'ctx-a', namespace: 'staging' }],
  },
};

test('k8s.pod_exec runs command in bound cluster', async () => {
  let execArgs;
  const tools = createK8sWriteTools({
    findCluster: () => ({ name: 'dev' }),
    listPods: async () => [{ name: 'api-1', containers: ['app'] }],
    execPodCommand: async (...args) => {
      execArgs = args;
      return { stdout: 'ok\n', stderr: '', exitCode: 0, command: ['/bin/sh', '-c', 'echo ok'], truncated: false };
    },
    deletePod: async () => ({}),
  });
  const podExec = tools.find((t) => t.name === 'k8s.pod_exec');
  assert.equal(podExec.riskLevel, 'write');
  const result = await podExec.execute({ podName: 'api-1', command: 'echo ok' }, k8sCtx);
  assert.equal(result.ok, true);
  assert.equal(execArgs[0], 'c1');
  assert.equal(execArgs[3], 'api-1');
  assert.equal(execArgs[4], 'app');
  assert.equal(execArgs[5], 'echo ok');
  assert.equal(result.data.stdout, 'ok\n');
});

test('k8s.delete_pod is danger and calls deletePod', async () => {
  let deleteArgs;
  const tools = createK8sWriteTools({
    findCluster: () => ({ name: 'prod' }),
    listPods: async () => [],
    execPodCommand: async () => ({}),
    deletePod: async (...args) => {
      deleteArgs = args;
      return { namespace: 'staging', podName: 'api-1', deleted: true };
    },
  });
  const deletePod = tools.find((t) => t.name === 'k8s.delete_pod');
  assert.equal(deletePod.riskLevel, 'danger');
  const result = await deletePod.execute({ podName: 'api-1' }, k8sCtx);
  assert.equal(result.ok, true);
  assert.deepEqual(deleteArgs.slice(0, 4), ['c1', 'ctx-a', 'staging', 'api-1']);
  assert.equal(result.data.deleted, true);
});

test('k8s.pod_exec requires bound k8s target', async () => {
  const tools = createK8sWriteTools({
    findCluster: () => null,
    listPods: async () => [],
    execPodCommand: async () => ({}),
    deletePod: async () => ({}),
  });
  const podExec = tools.find((t) => t.name === 'k8s.pod_exec');
  const result = await podExec.execute({ podName: 'x', command: 'ls' }, { agentSession: { targets: [] } });
  assert.equal(result.ok, false);
  assert.match(result.error, /未绑定 K8s/);
});
