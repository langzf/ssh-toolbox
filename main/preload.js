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
