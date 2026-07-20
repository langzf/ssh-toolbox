const { createToolRegistry } = require('./registry');
const metaTools = require('./meta');
const { createServerTools } = require('./server');
const { createSshReadTools } = require('./ssh-read');
const { createSshWriteTools } = require('./ssh-write');
const { createMetricsTool } = require('./metrics-tool');
const { createSftpReadTools } = require('./sftp-read');
const { createSftpWriteTools } = require('./sftp-write');
const { createK8sReadTools } = require('./k8s-read');
const { createK8sWriteTools } = require('./k8s-write');
const { createSkillTools } = require('./skills');

function createDefaultRegistry(opts = {}) {
  const { skillsRoot } = opts;
  return createToolRegistry([
    metaTools,
    createSkillTools({ skillsRoot }),
    createServerTools(),
    createSshReadTools(),
    createSshWriteTools(),
    [createMetricsTool()],
    createSftpReadTools(),
    createSftpWriteTools(),
    createK8sReadTools(),
    createK8sWriteTools(),
  ]);
}

module.exports = { createDefaultRegistry, createToolRegistry };
