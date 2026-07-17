const { createToolRegistry } = require('./registry');
const metaTools = require('./meta');
const { createServerTools } = require('./server');
const { createSshReadTools } = require('./ssh-read');
const { createSshWriteTools } = require('./ssh-write');
const { createMetricsTool } = require('./metrics-tool');
const { createSftpReadTools } = require('./sftp-read');
const { createSftpWriteTools } = require('./sftp-write');

function createDefaultRegistry() {
  return createToolRegistry([
    metaTools,
    createServerTools(),
    createSshReadTools(),
    createSshWriteTools(),
    [createMetricsTool()],
    createSftpReadTools(),
    createSftpWriteTools(),
  ]);
}

module.exports = { createDefaultRegistry, createToolRegistry };
