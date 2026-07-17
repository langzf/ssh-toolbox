const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createK8sReadTools } = require('./k8s-read');
const { apiListItems } = require('../../k8s');

test('apiListItems: client-node v1 direct items', () => {
  const items = [{ metadata: { name: 'default' } }];
  assert.deepEqual(apiListItems({ items }), items);
});

test('apiListItems: legacy .body wrapper', () => {
  const items = [{ metadata: { name: 'kube-system' } }];
  assert.deepEqual(apiListItems({ body: { items } }), items);
});

test('apiListItems: empty response', () => {
  assert.deepEqual(apiListItems(null), []);
  assert.deepEqual(apiListItems({}), []);
});

test('k8s.list_pods uses bound cluster and namespace', async () => {
  const calls = [];
  const tools = createK8sReadTools({
    listClusters: () => [],
    findCluster: (id) => ({ id, name: 'dev' }),
    listNamespaces: async () => [],
    listPods: async (clusterId, context, namespace) => {
      calls.push({ clusterId, context, namespace });
      return [{ name: 'nginx', phase: 'Running' }];
    },
    readPodLogs: async () => '',
    fetchPodMetrics: async () => ({ pods: [] }),
  });
  const listPods = tools.find((t) => t.name === 'k8s.list_pods');
  const result = await listPods.execute(
    {},
    {
      agentSession: {
        targets: [{ type: 'k8s', clusterId: 'c1', context: 'ctx-a', namespace: 'staging' }],
      },
    }
  );
  assert.equal(result.ok, true);
  assert.equal(calls[0].clusterId, 'c1');
  assert.equal(calls[0].context, 'ctx-a');
  assert.equal(calls[0].namespace, 'staging');
  assert.equal(result.data.pods[0].name, 'nginx');
});

test('k8s.pod_logs infers first container', async () => {
  let logArgs;
  const tools = createK8sReadTools({
    listClusters: () => [],
    findCluster: () => ({ name: 'prod' }),
    listNamespaces: async () => [],
    listPods: async () => [{ name: 'api-1', containers: ['app', 'sidecar'] }],
    readPodLogs: async (...args) => {
      logArgs = args;
      return 'hello log';
    },
    fetchPodMetrics: async () => ({ pods: [] }),
  });
  const podLogs = tools.find((t) => t.name === 'k8s.pod_logs');
  const result = await podLogs.execute(
    { podName: 'api-1', namespace: 'default' },
    { agentSession: { targets: [{ type: 'k8s', clusterId: 'c2' }] } }
  );
  assert.equal(result.ok, true);
  assert.equal(logArgs[4], 'app');
  assert.equal(result.data.text, 'hello log');
});
