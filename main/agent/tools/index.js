const { createToolRegistry } = require('./registry');
const metaTools = require('./meta');
const { createServerTools } = require('./server');
const { createSshReadTools } = require('./ssh-read');
const { createSshWriteTools } = require('./ssh-write');
const { createMetricsTool } = require('./metrics-tool');
const { createSftpReadTools } = require('./sftp-read');
const { createSftpWriteTools } = require('./sftp-write');
const { createK8sReadTools } = require('./k8s-read');

function createDefaultRegistry() {
  return createToolRegistry([
    metaTools,
    createServerTools(),
    createSshReadTools(),
    createSshWriteTools(),
    [createMetricsTool()],
    createSftpReadTools(),
    createSftpWriteTools(),
    createK8sReadTools(),
  ]);
}

module.exports = { createDefaultRegistry, createToolRegistry };
