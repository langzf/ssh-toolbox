/* global Terminal, FitAddon */

function createFitAddon() {
  if (typeof FitAddon === 'function') return new FitAddon();
  if (FitAddon && typeof FitAddon.FitAddon === 'function') return new FitAddon.FitAddon();
  throw new Error('FitAddon 未正确加载');
}

function bootCheck() {
  const errors = [];
  if (!window.localWebSSH) {
    errors.push('预加载脚本未就绪（localWebSSH 不可用）。请用 ./start.sh 或 npm start 启动。');
  }
  if (typeof Terminal === 'undefined') {
    errors.push('xterm.js 未加载，请检查 node_modules 是否已安装 (npm install)。');
  }
  if (!window.LocalWebSSHThemes) {
    errors.push('themes.js 未加载。');
  }
  if (!window.LocalWebSSHSftp) {
    errors.push('sftp-ui.js 未加载。');
  }
  if (!window.LocalWebSSHMonitor) {
    errors.push('monitor-ui.js 未加载。');
  }
  if (!window.LocalWebSSHAgent) {
    errors.push('agent-ui.js 未加载。');
  }
  try {
    createFitAddon();
  } catch (e) {
    errors.push(e.message);
  }
  if (errors.length) {
    const el = document.getElementById('boot-error');
    el.textContent = errors.join('\n\n');
    el.classList.remove('hidden');
    return false;
  }
  return true;
}

if (!bootCheck()) {
  throw new Error('SSH 工具箱启动失败');
}

const api = window.localWebSSH;

const els = {
  bootError: document.getElementById('boot-error'),
  snippetList: document.getElementById('snippet-list'),
  sessionList: document.getElementById('session-list'),
  serverCount: document.getElementById('server-count'),
  snippetCount: document.getElementById('snippet-count'),
  tabBar: document.getElementById('tab-bar'),
  sessionPanels: document.getElementById('session-panels'),
  btnPaneTerminal: document.getElementById('btn-pane-terminal'),
  btnPaneSftp: document.getElementById('btn-pane-sftp'),
  btnPaneMonitor: document.getElementById('btn-pane-monitor'),
  btnPaneAgent: document.getElementById('btn-pane-agent'),
  welcome: document.getElementById('welcome'),
  sessionToolbar: document.getElementById('session-toolbar'),
  toolbarTitle: document.getElementById('toolbar-title'),
  dialog: document.getElementById('connect-dialog'),
  dialogTitle: document.getElementById('dialog-title'),
  form: document.getElementById('connect-form'),
  formError: document.getElementById('form-error'),
  btnDelete: document.getElementById('btn-delete'),
  btnConnect: document.getElementById('btn-connect'),
  btnSaveOnly: document.getElementById('btn-save-only'),
  toast: document.getElementById('toast'),
  serversBrowser: document.getElementById('servers-browser'),
  serversBrowserList: document.getElementById('servers-browser-list'),
  snippetsBrowser: document.getElementById('snippets-browser'),
  agentBrowser: document.getElementById('agent-browser'),
  agentWorkbench: document.getElementById('agent-workbench'),
  serverSearch: document.getElementById('server-search'),
};

let savedConnections = [];
let snippets = [];
const themesApi = window.LocalWebSSHThemes;

let appSettings = { defaultPort: 22, fontSize: 13, themeId: 'default' };
let defaultUsername = 'root';

const sessions = new Map();
let activeSessionId = null;
let editingConnectionId = null;
let selectedServerId = null;
let dialogMode = 'edit';
let workspaceMode = 'servers';
let serverSearchQuery = '';
let toastTimer = null;
const sftpUi = window.LocalWebSSHSftp;
const monitorUi = window.LocalWebSSHMonitor;
const agentUiFactory = window.LocalWebSSHAgent;
let agentUi = null;

const readonlyConnectFields = ['host', 'port', 'username', 'label'];

function uid(prefix = 's') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function showToast(message, type = 'info', ms = 3200) {
  els.toast.textContent = message;
  els.toast.className = `toast ${type}`;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), ms);
}

function showFormError(message) {
  els.formError.textContent = message || '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getFormData() {
  return new FormData(els.form);
}

function entryFromForm(data) {
  const host = (data.get('host') || '').trim();
  const username = (data.get('username') || '').trim();
  if (!host) throw new Error('请填写主机名');
  if (!username) throw new Error('请填写用户名');

  return {
    id: editingConnectionId || uid('c'),
    label: (data.get('label') || '').trim() || host,
    host,
    port: Number(data.get('port')) || appSettings.defaultPort || 22,
    username,
    privateKeyPath: (data.get('privateKeyPath') || '').trim(),
  };
}

function setDialogMode(mode) {
  dialogMode = mode;
  const isConnect = mode === 'connect';
  els.dialogTitle.textContent = isConnect
    ? `连接到 ${els.form.label.value || els.form.host.value || '服务器'}`
    : editingConnectionId
      ? '编辑服务器'
      : '新建服务器';
  els.btnSaveOnly.classList.toggle('hidden', isConnect);
  els.btnDelete.classList.toggle('hidden', !editingConnectionId || isConnect);

  readonlyConnectFields.forEach((name) => {
    const input = els.form.elements[name];
    if (!input) return;
    input.readOnly = isConnect;
    input.classList.toggle('form-readonly', isConnect);
  });
}

function openDialog(prefill = {}, mode = 'edit') {
  showFormError('');
  els.form.reset();
  editingConnectionId = prefill.id || null;
  els.form.port.value = String(prefill.port || appSettings.defaultPort || 22);
  els.form.username.value = prefill.username || defaultUsername || '';
  if (prefill.host) els.form.host.value = prefill.host;
  if (prefill.label) els.form.label.value = prefill.label;
  if (prefill.privateKeyPath) els.form.privateKeyPath.value = prefill.privateKeyPath;

  setDialogMode(mode);
  els.btnConnect.disabled = false;
  els.btnSaveOnly.disabled = false;

  els.dialog.showModal();
  if (mode === 'connect') els.form.password.focus();
  else els.form.host.focus();
}

function openDialogEdit(item) {
  openDialog(item, 'edit');
}

async function openDialogConnect(item) {
  openDialog(item, 'connect');
  try {
    const cred = await api.getCredential(item.id);
    if (cred?.password) els.form.password.value = cred.password;
    if (cred?.passphrase) els.form.passphrase.value = cred.passphrase;
  } catch (_) {
    /* ignore */
  }
}

function formDataFromEntry(entry, extra = {}) {
  const fd = new FormData();
  fd.set('label', entry.label || entry.host);
  fd.set('host', entry.host);
  fd.set('port', String(entry.port || 22));
  fd.set('username', entry.username);
  if (entry.privateKeyPath) fd.set('privateKeyPath', entry.privateKeyPath);
  if (extra.password) fd.set('password', extra.password);
  if (extra.passphrase) fd.set('passphrase', extra.passphrase);
  return fd;
}

function countSessionsForServer(serverId) {
  if (!serverId) return 0;
  let n = 0;
  for (const s of sessions.values()) {
    if (s.savedId === serverId) n += 1;
  }
  return n;
}

function allocateSessionOrdinal(savedId) {
  return countSessionsForServer(savedId) + 1;
}

function formatSessionTitle(baseLabel, ordinal) {
  if (!ordinal || ordinal <= 1) return baseLabel;
  return `${baseLabel} (${ordinal})`;
}

async function connectToServer(item) {
  if (!item) return;

  editingConnectionId = item.id;
  selectedServerId = item.id;

  let cred = null;
  try {
    cred = await api.getCredential(item.id);
  } catch (_) {
    /* ignore */
  }

  const password = cred?.password || '';
  const passphrase = cred?.passphrase || '';

  if (password || item.privateKeyPath) {
    const fd = formDataFromEntry(item, { password, passphrase });
    const ok = await startConnection(fd, { fromSaved: true, cleanupOnFail: true });
    if (!ok) openDialogConnect(item);
    return;
  }

  const fd = formDataFromEntry(item);
  const ok = await startConnection(fd, { fromSaved: true, cleanupOnFail: true });
  if (!ok) openDialogConnect(item);
}

function focusInventoryView(view) {
  if (view === 'agent') {
    if (agentUi?.isInWorkbench?.()) {
      workspaceMode = 'agent-workbench';
    } else {
      workspaceMode = 'agent';
      agentUi?.leaveWorkbench?.();
    }
  } else {
    workspaceMode = view === 'snippets' ? 'snippets' : 'servers';
    agentUi?.leaveWorkbench?.();
  }
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  updateWorkspaceVisibility();
}

function sessionLabelFromEntry(entry) {
  return (entry.label || '').trim() || entry.host;
}

function getSessionDisplayName(session) {
  if (session.savedId) {
    const s = savedConnections.find((c) => c.id === session.savedId);
    if (s) {
      return formatSessionTitle(sessionLabelFromEntry(s), session.sessionOrdinal);
    }
  }
  return session.title;
}

async function persistCredentialFromForm(data, connectionId) {
  if (!connectionId || data.get('rememberPassword') === 'off') return;
  const password = data.get('password') || '';
  const passphrase = data.get('passphrase') || '';
  if (!password && !passphrase) return;
  await api.saveCredential({
    connectionId,
    password,
    passphrase,
  });
}

function applySessionLabel(session, sessionId) {
  if (!session) return;
  const label = getSessionDisplayName(session);
  session.title = label;
  if (session.tab) session.tab.dataset.ordinal = String(session.sessionOrdinal || 1);
  const tabLabel = session.tab?.querySelector('.tab-label');
  if (tabLabel) tabLabel.textContent = label;
  if (sessionId === activeSessionId) {
    els.toolbarTitle.textContent = label;
  }
}

function getFilteredServers() {
  const q = serverSearchQuery.trim().toLowerCase();
  if (!q) return savedConnections;
  return savedConnections.filter((item) => {
    const hay = `${item.label} ${item.host} ${item.username}`.toLowerCase();
    return hay.includes(q);
  });
}

function closeDialog() {
  els.dialog.close();
  editingConnectionId = null;
  showFormError('');
}

async function loadConnections() {
  try {
    savedConnections = await api.listConnections();
    if (!Array.isArray(savedConnections)) savedConnections = [];
  } catch (err) {
    savedConnections = [];
    showToast(`读取连接列表失败: ${err.message}`, 'error', 5000);
  }
  refreshServerCounts();
  renderServersBrowser();
  updateWorkspaceVisibility();
}

function refreshServerCounts() {
  els.serverCount.textContent = String(savedConnections.length);
  els.snippetCount.textContent = String(snippets.length);
}

async function loadSnippets() {
  try {
    snippets = await api.listSnippets();
    if (!Array.isArray(snippets)) snippets = [];
  } catch (err) {
    snippets = [];
  }
  renderSnippets();
  refreshServerCounts();
}

async function persistConnections() {
  const saved = await api.saveConnections(savedConnections);
  savedConnections = saved;
  refreshServerCounts();
  renderServersBrowser();
  updateWorkspaceVisibility();
}

async function saveConnectionFromForm() {
  const data = getFormData();
  let entry;
  try {
    entry = entryFromForm(data);
  } catch (err) {
    showFormError(err.message);
    showToast(err.message, 'error');
    return false;
  }

  const idx = savedConnections.findIndex((c) => c.id === entry.id);
  if (idx >= 0) savedConnections[idx] = entry;
  else savedConnections.push(entry);

  try {
    editingConnectionId = entry.id;
    await persistConnections();
    await persistCredentialFromForm(data, entry.id);
    focusInventoryView('servers');
    showToast(`已保存「${entry.label}」`, 'success');
    closeDialog();
    return true;
  } catch (err) {
    showFormError(err.message);
    showToast(`保存失败: ${err.message}`, 'error', 5000);
    return false;
  }
}

function renderServersBrowser() {
  if (!els.serversBrowserList) return;
  const items = getFilteredServers();
  els.serversBrowserList.innerHTML = '';
  if (!savedConnections.length) return;
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.style.cssText = 'color:#4a6278;padding:12px;';
    li.textContent = '无匹配结果';
    els.serversBrowserList.appendChild(li);
    return;
  }
  for (const item of items) {
    const liveCount = countSessionsForServer(item.id);
    const li = document.createElement('li');
    li.className = `browser-card${liveCount ? ' live' : ''}`;
    li.innerHTML = `
      <div class="browser-card-body">
        <div class="browser-card-title">${escapeHtml(item.label || item.host)}</div>
        <div class="browser-card-sub">${escapeHtml(item.host)}${liveCount ? ` · ${liveCount} 个会话` : ''}</div>
      </div>
      <button type="button" class="browser-card-new" title="新建会话">+</button>
      <button type="button" class="browser-card-edit" title="编辑">✎</button>
    `;
    li.querySelector('.browser-card-new').addEventListener('click', (e) => {
      e.stopPropagation();
      connectToServer(item);
    });
    li.querySelector('.browser-card-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openDialogEdit(item);
    });
    li.addEventListener('click', () => connectToServer(item));
    els.serversBrowserList.appendChild(li);
  }
}

function renderSnippets() {
  if (!els.snippetList) return;
  refreshServerCounts();
  els.snippetList.innerHTML = '';
  if (!snippets.length) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.style.cssText = 'color:#4a6278;padding:12px;';
    li.textContent = '保存常用命令；连接终端后点击可发送';
    els.snippetList.appendChild(li);
    return;
  }
  for (const sn of snippets) {
    const li = document.createElement('li');
    li.className = 'browser-card';
    li.innerHTML = `
      <div class="browser-card-body">
        <div class="browser-card-title">${escapeHtml(sn.name)}</div>
        <div class="browser-card-sub">${escapeHtml(sn.command)}</div>
      </div>
    `;
    li.addEventListener('click', () => sendSnippet(sn.command));
    els.snippetList.appendChild(li);
  }
}

function renderSessions() {
  els.sessionList.innerHTML = '';
  if (!sessions.size) {
    const li = document.createElement('li');
    li.className = 'empty-hint';
    li.textContent = '无活动会话';
    els.sessionList.appendChild(li);
    return;
  }
  for (const [id, session] of sessions) {
    const li = document.createElement('li');
    const name = getSessionDisplayName(session);
    if (id === activeSessionId) li.classList.add('active');
    li.innerHTML = `<span class="sess-icon">&gt;_</span><span>${escapeHtml(name)}</span>`;
    li.addEventListener('click', () => setActiveSession(id));
    els.sessionList.appendChild(li);
  }
}

function updateWorkspaceVisibility() {
  const isTerminal = workspaceMode === 'terminal' && sessions.size > 0;
  const isServers = workspaceMode === 'servers';
  const isSnippets = workspaceMode === 'snippets';
  const isAgent = workspaceMode === 'agent';
  const isAgentWb = workspaceMode === 'agent-workbench';
  const noServers = savedConnections.length === 0;

  els.welcome.classList.toggle('hidden', !isServers || !noServers);
  els.serversBrowser.classList.toggle('hidden', !isServers || noServers);
  els.snippetsBrowser.classList.toggle('hidden', !isSnippets);
  els.agentBrowser?.classList.toggle('hidden', !isAgent);
  els.agentWorkbench?.classList.toggle('hidden', !isAgentWb);
  els.tabBar.classList.toggle('hidden', !isTerminal);
  els.sessionPanels.classList.toggle('hidden', !isTerminal);
  els.sessionToolbar.classList.toggle('hidden', !isTerminal);

  renderSessions();
}

function setSessionPane(sessionId, pane) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const valid = ['terminal', 'sftp', 'monitor', 'agent'];
  session.viewPane = valid.includes(pane) ? pane : 'terminal';

  if (session.viewPane !== 'monitor' && session.monitorStop) {
    session.monitorStop();
  }
  if (session.viewPane !== 'agent' && session.agentDeactivate) {
    session.agentDeactivate();
  }

  const p = session.viewPane;
  session.panel.classList.toggle('active', p === 'terminal');
  session.sftpPanel.classList.toggle('active', p === 'sftp');
  session.monitorPanel.classList.toggle('active', p === 'monitor');
  session.agentPanel.classList.toggle('active', p === 'agent');

  els.btnPaneTerminal?.classList.toggle('active', p === 'terminal');
  els.btnPaneSftp?.classList.toggle('active', p === 'sftp');
  els.btnPaneMonitor?.classList.toggle('active', p === 'monitor');
  els.btnPaneAgent?.classList.toggle('active', p === 'agent');

  if (p === 'sftp') {
    if (!session.sftpReady) {
      session.sftpReady = true;
      session.sftpInit();
    } else {
      session.sftpRefresh();
    }
  } else if (p === 'monitor') {
    session.monitorStart();
  } else if (p === 'agent') {
    if (!session.agentReady) {
      session.agentReady = true;
      session.agentInit();
    } else {
      session.agentRefresh?.();
    }
  } else {
    requestAnimationFrame(() => {
      session.resize();
      session.term.focus();
    });
  }
}

function applyThemeToAllSessions() {
  const themeId = themesApi.normalizeThemeId(appSettings.themeId);
  themesApi.applyDocumentTheme(themeId);
  const xtermTheme = themesApi.getXtermTheme(themeId);
  const fontSize = appSettings.fontSize || 13;
  for (const s of sessions.values()) {
    s.term.options.theme = xtermTheme;
    s.term.options.fontSize = fontSize;
  }
}

function createTerminal(sessionId) {
  const panel = document.createElement('div');
  panel.className = 'terminal-panel';
  panel.dataset.sessionId = sessionId;

  const host = document.createElement('div');
  host.className = 'terminal-host';
  panel.appendChild(host);

  const term = new Terminal({
    cursorBlink: true,
    fontFamily: 'SF Mono, Menlo, Monaco, monospace',
    fontSize: appSettings.fontSize || 13,
    theme: themesApi.getXtermTheme(appSettings.themeId),
  });

  const fitAddon = createFitAddon();
  term.loadAddon(fitAddon);
  term.open(host);

  term.onData((data) => api.write(sessionId, data));

  const resize = () => {
    try {
      fitAddon.fit();
      api.resize(sessionId, term.cols, term.rows);
    } catch (_) {
      /* panel may be hidden */
    }
  };

  const ro = new ResizeObserver(() => {
    if (panel.classList.contains('active')) resize();
  });
  ro.observe(host);

  els.sessionPanels.appendChild(panel);
  return { panel, host, term, fitAddon, resize, ro };
}

function createTab(sessionId, title) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'tab';
  tab.dataset.sessionId = sessionId;
  tab.innerHTML = `<span class="tab-label">${escapeHtml(title)}</span><span class="close">×</span>`;
  tab.addEventListener('click', (e) => {
    if (e.target.classList.contains('close')) closeSession(sessionId);
    else setActiveSession(sessionId);
  });
  els.tabBar.appendChild(tab);
  return tab;
}

function setActiveSession(sessionId) {
  activeSessionId = sessionId;
  workspaceMode = 'terminal';
  const session = sessions.get(sessionId);
  if (session) {
    els.toolbarTitle.textContent = getSessionDisplayName(session);
    if (session.savedId) selectedServerId = session.savedId;
  }

  for (const [id, s] of sessions) {
    const active = id === sessionId;
    s.tab.classList.toggle('active', active);
    if (active) {
      setSessionPane(sessionId, s.viewPane || 'terminal');
    } else {
      s.panel.classList.remove('active');
      s.sftpPanel.classList.remove('active');
      s.monitorPanel.classList.remove('active');
      s.agentPanel.classList.remove('active');
      s.monitorStop?.();
      s.agentDeactivate?.();
    }
  }
  renderServersBrowser();
  renderSessions();
  updateWorkspaceVisibility();
}

async function teardownSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  await api.disconnect(sessionId);
  session.ro.disconnect();
  session.term.dispose();
  session.panel.remove();
  session.sftpPanel.remove();
  session.monitorStop?.();
  session.monitorPanel.remove();
  session.agentDestroy?.();
  session.agentPanel.remove();
  session.tab.remove();
  sessions.delete(sessionId);
  if (activeSessionId === sessionId) activeSessionId = null;
}

async function startConnection(formData, options = {}) {
  const sessionId = uid();
  let entry;
  let config;
  try {
    entry = entryFromForm(formData);
    const serverId = editingConnectionId || entry.id;
    entry.id = serverId;
    editingConnectionId = serverId;

    config = {
      sessionId,
      host: entry.host,
      port: entry.port,
      username: entry.username,
      password: formData.get('password') || '',
      privateKeyPath: formData.get('privateKeyPath') || entry.privateKeyPath || '',
      passphrase: formData.get('passphrase') || '',
    };
  } catch (err) {
    showToast(err.message, 'error');
    showFormError(err.message);
    return false;
  }

  const savedId = editingConnectionId || entry.id;
  const sessionOrdinal = allocateSessionOrdinal(savedId);
  const displayName = formatSessionTitle(sessionLabelFromEntry(entry), sessionOrdinal);
  let terminal;
  try {
    terminal = createTerminal(sessionId);
  } catch (err) {
    showToast(err.message, 'error', 6000);
    showFormError(err.message);
    return false;
  }
  const tab = createTab(sessionId, displayName);
  const sftp = sftpUi.createSftpPanel(sessionId, api, showToast);
  const monitor = monitorUi.createMonitorPanel(sessionId, api, showToast);
  const agent = agentUiFactory.createSessionAgentPanel(
    sessionId,
    () => sessions.get(sessionId)?.savedId,
    {
      api,
      showToast,
      onOpenInSidebar: (agentSessionId) => {
        agentUi?.openSessionInWorkbench?.(agentSessionId);
      },
    }
  );
  els.sessionPanels.appendChild(sftp.panel);
  els.sessionPanels.appendChild(monitor.panel);
  els.sessionPanels.appendChild(agent.panel);

  sessions.set(sessionId, {
    ...terminal,
    tab,
    title: displayName,
    savedId,
    sessionOrdinal,
    meta: config,
    viewPane: 'terminal',
    sftpPanel: sftp.panel,
    sftpInit: sftp.init,
    sftpRefresh: sftp.refresh,
    sftpReady: false,
    monitorPanel: monitor.panel,
    monitorStart: monitor.start,
    monitorStop: monitor.stop,
    monitorRefresh: monitor.refresh,
    agentPanel: agent.panel,
    agentInit: agent.init,
    agentDeactivate: agent.deactivate,
    agentDestroy: agent.destroy,
    agentRefresh: agent.refresh,
    agentReady: false,
  });

  updateWorkspaceVisibility();
  setActiveSession(sessionId);
  renderSessions();
  terminal.term.writeln(`\x1b[90m正在连接 ${config.host}:${config.port} …\x1b[0m\r\n`);

  els.btnConnect.disabled = true;
  els.btnConnect.textContent = '连接中…';

  try {
    const result = await api.connect(config);
    terminal.term.writeln(`\x1b[32m已连接 ${result.username}@${result.host}\x1b[0m`);
    if (result.usedKeyPath) {
      terminal.term.writeln(`\x1b[90m使用私钥: ${result.usedKeyPath}\x1b[0m`);
    }
    terminal.term.writeln('');
    requestAnimationFrame(() => terminal.resize());

    const idx = savedConnections.findIndex((c) => c.id === entry.id);
    if (idx >= 0) savedConnections[idx] = entry;
    else savedConnections.push(entry);
    await persistConnections();
    sessions.get(sessionId).savedId = entry.id;
    editingConnectionId = entry.id;
    applySessionLabel(sessions.get(sessionId), sessionId);

    await persistCredentialFromForm(formData, entry.id);

    closeDialog();
    showToast(`已连接 ${displayName}`, 'success');
    renderServersBrowser();
    return true;
  } catch (err) {
    const msg = err.message || String(err);
    terminal.term.writeln(`\x1b[31m连接失败: ${msg}\x1b[0m\r\n`);
    showToast(msg, 'error', 5000);
    showFormError(msg);
    if (options.cleanupOnFail) {
      await teardownSession(sessionId);
      updateWorkspaceVisibility();
    }
    renderServersBrowser();
    return false;
  } finally {
    els.btnConnect.disabled = false;
    els.btnConnect.textContent = '连接';
  }
}

async function closeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  await teardownSession(sessionId);

  if (activeSessionId === sessionId) {
    const keys = [...sessions.keys()];
    activeSessionId = keys.length ? keys[keys.length - 1] : null;
    if (activeSessionId) setActiveSession(activeSessionId);
    else workspaceMode = 'servers';
  }

  updateWorkspaceVisibility();
  renderServersBrowser();
  showToast('会话已关闭', 'info', 2000);
}

function sendSnippet(command) {
  if (!activeSessionId) {
    showToast('请先连接 SSH 会话', 'error');
    return;
  }
  api.write(activeSessionId, `${command}\n`);
  showToast(`已发送: ${command}`, 'success', 2000);
}

function setSidebarView(view) {
  focusInventoryView(view);
  if (view === 'servers') renderServersBrowser();
  if (view === 'snippets') renderSnippets();
  if (view === 'agent') agentUi?.loadSessions?.();
}


// —— Events ——
els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await startConnection(getFormData());
});

els.btnSaveOnly.addEventListener('click', async (e) => {
  e.preventDefault();
  await saveConnectionFromForm();
});

els.btnDelete.addEventListener('click', async () => {
  if (!editingConnectionId) return;
  const id = editingConnectionId;
  savedConnections = savedConnections.filter((c) => c.id !== id);
  await api.deleteCredential(id);
  await persistConnections();
  if (selectedServerId === id) selectedServerId = null;
  showToast('已删除服务器', 'success');
  closeDialog();
  updateWorkspaceVisibility();
});

document.getElementById('btn-new').addEventListener('click', () => openDialog({}, 'edit'));
document.getElementById('btn-welcome-connect').addEventListener('click', () => openDialog({}, 'edit'));
document.getElementById('btn-new-tab').addEventListener('click', () => {
  const serverId = selectedServerId || sessions.get(activeSessionId)?.savedId;
  const item = savedConnections.find((c) => c.id === serverId);
  if (item) connectToServer(item);
  else openDialog({}, 'connect');
});
document.getElementById('btn-cancel').addEventListener('click', closeDialog);
document.getElementById('dialog-close').addEventListener('click', closeDialog);
document.getElementById('btn-disconnect').addEventListener('click', () => {
  if (activeSessionId) closeSession(activeSessionId);
});

document.getElementById('btn-pick-key').addEventListener('click', async () => {
  try {
    const p = await api.pickPrivateKey();
    if (p) els.form.privateKeyPath.value = p;
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => setSidebarView(btn.dataset.view));
});

if (els.serverSearch) {
  els.serverSearch.addEventListener('input', (e) => {
    serverSearchQuery = e.target.value;
    renderServersBrowser();
  });
}

document.getElementById('btn-help').addEventListener('click', () => {
  showToast('同一服务器可开多个会话：点卡片或 +；侧栏会话切换；工具栏 + 再开新会话', 'info', 5500);
});

els.btnPaneTerminal?.addEventListener('click', () => {
  if (activeSessionId) setSessionPane(activeSessionId, 'terminal');
});

els.btnPaneSftp?.addEventListener('click', () => {
  if (activeSessionId) setSessionPane(activeSessionId, 'sftp');
});

els.btnPaneMonitor?.addEventListener('click', () => {
  if (activeSessionId) setSessionPane(activeSessionId, 'monitor');
});

els.btnPaneAgent?.addEventListener('click', () => {
  if (activeSessionId) setSessionPane(activeSessionId, 'agent');
});

document.getElementById('btn-settings').addEventListener('click', async () => {
  const dlg = document.getElementById('settings-dialog');
  const form = document.getElementById('settings-form');
  form.defaultPort.value = appSettings.defaultPort;
  form.fontSize.value = appSettings.fontSize;
  themesApi.populateThemeSelect(document.getElementById('settings-theme'), appSettings.themeId);
  try {
    const agent = await api.agentGetSettings();
    form.agentBaseUrl.value = agent.baseUrl || '';
    form.agentModel.value = agent.model || '';
    form.agentPolicyMode.value = agent.policyMode || 'standard';
    form.agentMaxSteps.value = agent.maxSteps ?? 12;
    form.agentTimeoutMs.value = agent.timeoutMs ?? 60000;
    form.agentApiKey.value = '';
    form.agentApiKey.placeholder = agent.hasApiKey ? '已保存 Key（留空则不修改）' : '请输入 API Key';
  } catch (err) {
    showToast(`读取 Agent 设置失败: ${err.message}`, 'error');
  }
  dlg.showModal();
});

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  appSettings = {
    defaultPort: Number(fd.get('defaultPort')) || 22,
    fontSize: Number(fd.get('fontSize')) || 13,
    themeId: themesApi.normalizeThemeId(fd.get('themeId')),
  };
  applyThemeToAllSessions();
  await api.saveSettings(appSettings);
  const agentPayload = {
    baseUrl: String(fd.get('agentBaseUrl') || '').trim(),
    model: String(fd.get('agentModel') || '').trim(),
    policyMode: fd.get('agentPolicyMode') || 'standard',
    maxSteps: Number(fd.get('agentMaxSteps')) || 12,
    timeoutMs: Number(fd.get('agentTimeoutMs')) || 60000,
  };
  const apiKey = String(fd.get('agentApiKey') || '').trim();
  if (apiKey) agentPayload.apiKey = apiKey;
  try {
    await api.agentSaveSettings(agentPayload);
  } catch (err) {
    showToast(`Agent 设置保存失败: ${err.message}`, 'error');
    return;
  }
  document.getElementById('settings-dialog').close();
  showToast('设置已保存', 'success');
});

document.getElementById('btn-agent-test').addEventListener('click', async () => {
  const btn = document.getElementById('btn-agent-test');
  btn.disabled = true;
  try {
    const reply = await api.agentChat({ messages: [{ role: 'user', content: '回复：pong' }] });
    const text = reply?.content || JSON.stringify(reply);
    showToast(`Agent 回复: ${text.slice(0, 120)}`, 'success', 6000);
  } catch (err) {
    showToast(err.message || String(err), 'error', 6000);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('settings-close').addEventListener('click', () => {
  document.getElementById('settings-dialog').close();
});
document.getElementById('settings-cancel').addEventListener('click', () => {
  document.getElementById('settings-dialog').close();
});

document.getElementById('btn-new-snippet').addEventListener('click', () => {
  document.getElementById('snippet-form').reset();
  document.getElementById('snippet-dialog').showModal();
});

document.getElementById('snippet-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  snippets.push({
    id: uid('sn'),
    name: fd.get('name').trim(),
    command: fd.get('command').trim(),
  });
  snippets = await api.saveSnippets(snippets);
  renderSnippets();
  document.getElementById('snippet-dialog').close();
  showToast('片段已保存', 'success');
});

document.getElementById('snippet-dialog-close').addEventListener('click', () => {
  document.getElementById('snippet-dialog').close();
});
document.getElementById('snippet-cancel').addEventListener('click', () => {
  document.getElementById('snippet-dialog').close();
});

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  showToast(`未捕获错误: ${e.reason?.message || e.reason}`, 'error', 6000);
});

api.onOutput(({ sessionId, data }) => {
  sessions.get(sessionId)?.term.write(data);
});

api.onClosed(({ sessionId }) => {
  const s = sessions.get(sessionId);
  if (s) s.term.writeln('\r\n\x1b[33m连接已断开\x1b[0m');
});

async function init() {
  try {
    const meta = await api.getAppMeta();
    appSettings = { ...appSettings, ...meta.settings };
    appSettings.themeId = themesApi.normalizeThemeId(appSettings.themeId);
    applyThemeToAllSessions();
  } catch (err) {
    showToast(`初始化失败: ${err.message}`, 'error', 5000);
  }
  agentUi = agentUiFactory.createAgentModule({
    api,
    showToast,
    uid,
    onEnterWorkbench: () => {
      workspaceMode = 'agent-workbench';
      document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.view === 'agent');
      });
      updateWorkspaceVisibility();
    },
    onLeaveWorkbench: () => {
      if (workspaceMode === 'agent-workbench') workspaceMode = 'agent';
      updateWorkspaceVisibility();
    },
  });
  await loadConnections();
  await loadSnippets();
  focusInventoryView('servers');
}

init();
