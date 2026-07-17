const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localWebSSH', {
  getAppMeta: () => ipcRenderer.invoke('app-meta'),
  pickPrivateKey: () => ipcRenderer.invoke('pick-private-key'),
  listConnections: () => ipcRenderer.invoke('connections-list'),
  saveConnections: (items) => ipcRenderer.invoke('connections-save', items),
  getCredential: (connectionId) => ipcRenderer.invoke('credential-get', connectionId),
  saveCredential: (payload) => ipcRenderer.invoke('credential-save', payload),
  deleteCredential: (connectionId) => ipcRenderer.invoke('credential-delete', connectionId),
  listSnippets: () => ipcRenderer.invoke('snippets-list'),
  saveSnippets: (items) => ipcRenderer.invoke('snippets-save', items),
  saveSettings: (settings) => ipcRenderer.invoke('settings-save', settings),
  connect: (config) => ipcRenderer.invoke('ssh-connect', config),
  disconnect: (sessionId) => ipcRenderer.invoke('ssh-disconnect', sessionId),
  write: (sessionId, data) => ipcRenderer.send('ssh-write', { sessionId, data }),
  resize: (sessionId, cols, rows) => ipcRenderer.send('ssh-resize', { sessionId, cols, rows }),
  onOutput: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('ssh-output', listener);
    return () => ipcRenderer.removeListener('ssh-output', listener);
  },
  onClosed: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('ssh-closed', listener);
    return () => ipcRenderer.removeListener('ssh-closed', listener);
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  sftpHome: (sessionId) => ipcRenderer.invoke('sftp-home', { sessionId }),
  sftpList: (sessionId, remotePath) => ipcRenderer.invoke('sftp-list', { sessionId, remotePath }),
  sftpMkdir: (sessionId, remotePath) => ipcRenderer.invoke('sftp-mkdir', { sessionId, remotePath }),
  sftpDelete: (sessionId, remotePath, isDirectory) =>
    ipcRenderer.invoke('sftp-delete', { sessionId, remotePath, isDirectory }),
  sftpDownload: (sessionId, remotePath, fileName) =>
    ipcRenderer.invoke('sftp-download', { sessionId, remotePath, fileName }),
  sftpUpload: (sessionId, remoteDir) => ipcRenderer.invoke('sftp-upload', { sessionId, remoteDir }),
  fetchMetrics: (sessionId) => ipcRenderer.invoke('metrics-fetch', { sessionId }),

  k8sListClusters: () => ipcRenderer.invoke('k8s-clusters-list'),
  k8sSaveClusters: (items) => ipcRenderer.invoke('k8s-clusters-save', items),
  k8sParseContexts: (kubeconfigYaml) => ipcRenderer.invoke('k8s-parse-contexts', kubeconfigYaml),
  k8sPickKubeconfig: () => ipcRenderer.invoke('k8s-pick-kubeconfig'),
  k8sTestConnection: (payload) => ipcRenderer.invoke('k8s-test-connection', payload),
  k8sListNamespaces: (payload) => ipcRenderer.invoke('k8s-list-namespaces', payload),
  k8sListPods: (payload) => ipcRenderer.invoke('k8s-list-pods', payload),
  k8sFetchLogs: (payload) => ipcRenderer.invoke('k8s-fetch-logs', payload),
  k8sLogsStreamStart: (payload) => ipcRenderer.invoke('k8s-logs-stream-start', payload),
  k8sLogsStreamStop: (streamId) => ipcRenderer.invoke('k8s-logs-stream-stop', { streamId }),
  k8sExecStart: (payload) => ipcRenderer.invoke('k8s-exec-start', payload),
  k8sExecWrite: (execId, data) => ipcRenderer.send('k8s-exec-write', { execId, data }),
  k8sExecResize: (execId, cols, rows) => ipcRenderer.send('k8s-exec-resize', { execId, cols, rows }),
  k8sExecStop: (execId) => ipcRenderer.invoke('k8s-exec-stop', { execId }),
  k8sFetchMetrics: (payload) => ipcRenderer.invoke('k8s-fetch-metrics', payload),
  onK8sLogChunk: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('k8s-log-chunk', listener);
    return () => ipcRenderer.removeListener('k8s-log-chunk', listener);
  },
  onK8sLogEnd: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('k8s-log-end', listener);
    return () => ipcRenderer.removeListener('k8s-log-end', listener);
  },
  onK8sLogError: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('k8s-log-error', listener);
    return () => ipcRenderer.removeListener('k8s-log-error', listener);
  },
  onK8sExecOutput: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('k8s-exec-output', listener);
    return () => ipcRenderer.removeListener('k8s-exec-output', listener);
  },
  onK8sExecClosed: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('k8s-exec-closed', listener);
    return () => ipcRenderer.removeListener('k8s-exec-closed', listener);
  },

  agentGetSettings: () => ipcRenderer.invoke('agent-settings-get'),
  agentSaveSettings: (s) => ipcRenderer.invoke('agent-settings-save', s),
  agentChat: (payload) => ipcRenderer.invoke('agent-chat', payload),
  agentSend: (payload) => ipcRenderer.invoke('agent-send', payload),
  agentListSessions: () => ipcRenderer.invoke('agent-sessions-list'),
  agentCreateSession: (payload) => ipcRenderer.invoke('agent-sessions-create', payload),
  agentGetSession: (id) => ipcRenderer.invoke('agent-sessions-get', id),
  agentAppendMessage: (id, msg) => ipcRenderer.invoke('agent-sessions-append-message', { id, msg }),
  agentSetTargets: (id, targets) => ipcRenderer.invoke('agent-sessions-set-targets', { id, targets }),
  agentDeleteSession: (id) => ipcRenderer.invoke('agent-sessions-delete', id),
  agentConfirmResponse: (payload) => ipcRenderer.invoke('agent-confirm-response', payload),
  onAgentConfirmRequest: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('agent-confirm-request', listener);
    return () => ipcRenderer.removeListener('agent-confirm-request', listener);
  },
});
