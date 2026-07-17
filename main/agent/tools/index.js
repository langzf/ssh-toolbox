const { createToolRegistry } = require('./registry');
const metaTools = require('./meta');
const { createServerTools } = require('./server');
const { createSshReadTools } = require('./ssh-read');
const { createMetricsTool } = require('./metrics-tool');
const { createSftpReadTools } = require('./sftp-read');

function createDefaultRegistry() {
  return createToolRegistry([
    metaTools,
    createServerTools(),
    createSshReadTools(),
    [createMetricsTool()],
    createSftpReadTools(),
  ]);
}

module.exports = { createDefaultRegistry, createToolRegistry };
