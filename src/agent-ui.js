/* global escapeHtml */

const confirmBus = {
  subs: new Set(),
  inited: false,
  init(api) {
    if (this.inited) return;
    this.inited = true;
    api.onAgentConfirmRequest?.((req) => {
      for (const fn of this.subs) fn(req);
    });
  },
  subscribe(fn) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  },
};

function riskLabel(level) {
  if (level === 'danger') return '高危';
  if (level === 'write') return '写操作';
  return '只读';
}

const TOOL_LABELS = {
  agent_ask_user: '向你确认信息',
  'agent.ask_user': '向你确认信息',
  agent_load_skill: '加载技能',
  'agent.load_skill': '加载技能',
  agent_read_skill_resource: '读取技能资料',
  'agent.read_skill_resource': '读取技能资料',
  server_list: '查看服务器列表',
  'server.list': '查看服务器列表',
  server_connect: '连接服务器',
  'server.connect': '连接服务器',
  ssh_exec: '执行远程命令',
  'ssh.exec': '执行远程命令',
  ssh_tail_log: '读取日志',
  'ssh.tail_log': '读取日志',
  metrics_fetch: '采集主机指标',
  'metrics.fetch': '采集主机指标',
  sftp_list: '浏览远程目录',
  'sftp.list': '浏览远程目录',
  sftp_read: '读取远程文件',
  'sftp.read': '读取远程文件',
  sftp_write: '写入远程文件',
  'sftp.write': '写入远程文件',
  sftp_upload: '上传文件',
  'sftp.upload': '上传文件',
  sftp_delete: '删除远程文件',
  'sftp.delete': '删除远程文件',
  k8s_list_clusters: '列出 K8s 集群',
  'k8s.list_clusters': '列出 K8s 集群',
  k8s_list_namespaces: '列出命名空间',
  'k8s.list_namespaces': '列出命名空间',
  k8s_list_pods: '列出 Pod',
  'k8s.list_pods': '列出 Pod',
  k8s_pod_logs: '读取 Pod 日志',
  'k8s.pod_logs': '读取 Pod 日志',
  k8s_metrics: '采集 K8s 指标',
  'k8s.metrics': '采集 K8s 指标',
  k8s_pod_exec: '在 Pod 中执行命令',
  'k8s.pod_exec': '在 Pod 中执行命令',
  k8s_delete_pod: '删除 Pod',
  'k8s.delete_pod': '删除 Pod',
};

function toolDisplayName(name) {
  if (!name) return '操作';
  return TOOL_LABELS[name] || name.replace(/[._]/g, ' ');
}

function parseToolArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function summarizeToolCall(name, args) {
  const a = parseToolArgs(args);
  const label = toolDisplayName(name);
  if (name.includes('connect') && a.serverId) return `${label}`;
  if (name.includes('exec') && a.command) {
    const cmd = String(a.command).trim();
    const short = cmd.length > 48 ? `${cmd.slice(0, 48)}…` : cmd;
    return `${label} · ${short}`;
  }
  if (name.includes('tail_log') && a.path) return `${label} · ${a.path}`;
  if ((name.includes('sftp') || name.includes('list') || name.includes('read')) && a.remotePath) {
    return `${label} · ${a.remotePath}`;
  }
  if (name.includes('pod') && a.podName) {
    const ns = a.namespace ? `${a.namespace}/` : '';
    return `${label} · ${ns}${a.podName}`;
  }
  if (name.includes('load_skill') && a.name) return `${label} · ${a.name}`;
  if (a.namespace) return `${label} · ${a.namespace}`;
  return label;
}

function summarizeToolResult(name, content) {
  let parsed = null;
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content;
  } catch (_) {
    const text = String(content || '').trim();
    if (!text) return { ok: true, title: `${toolDisplayName(name)}完成`, detail: '' };
    return {
      ok: true,
      title: `${toolDisplayName(name)}完成`,
      detail: text.length > 120 ? `${text.slice(0, 120)}…` : text,
    };
  }

  const ok = parsed?.ok !== false;
  const err = parsed?.error || '';
  const data = parsed?.data;

  if (!ok) {
    return {
      ok: false,
      title: `${toolDisplayName(name)}失败`,
      detail: err || '未知错误',
    };
  }

  if (name.includes('connect')) {
    return { ok: true, title: '已连接服务器', detail: data?.sshSessionId ? 'SSH 会话已就绪' : '' };
  }
  if (name.includes('list_clusters') && data?.clusters) {
    return { ok: true, title: `找到 ${data.clusters.length} 个集群`, detail: '' };
  }
  if (name.includes('list_namespaces') && Array.isArray(data)) {
    return { ok: true, title: `找到 ${data.length} 个命名空间`, detail: '' };
  }
  if (name.includes('list_pods') && Array.isArray(data)) {
    return { ok: true, title: `找到 ${data.length} 个 Pod`, detail: '' };
  }
  if (name.includes('server_list') || name.includes('server.list')) {
    const n = Array.isArray(data) ? data.length : data?.servers?.length;
    if (n != null) return { ok: true, title: `找到 ${n} 台服务器`, detail: '' };
  }
  if (name.includes('metrics')) {
    return { ok: true, title: '指标已采集', detail: '' };
  }
  if (name.includes('load_skill')) {
    return { ok: true, title: `已加载技能 ${data?.name || ''}`.trim(), detail: '' };
  }
  if (name.includes('exec') && data?.stdout != null) {
    const out = String(data.stdout || data.output || '').trim();
    return {
      ok: true,
      title: '命令已执行',
      detail: out ? (out.length > 100 ? `${out.slice(0, 100)}…` : out) : `退出码 ${data.exitCode ?? 0}`,
    };
  }
  if (name.includes('logs') || name.includes('tail_log')) {
    const text = typeof data === 'string' ? data : data?.text || data?.logs || '';
    const lines = String(text).split('\n').filter(Boolean).length;
    return { ok: true, title: '日志已读取', detail: lines ? `${lines} 行` : '' };
  }

  return { ok: true, title: `${toolDisplayName(name)}完成`, detail: '' };
}

function renderToolCards(toolCalls) {
  if (!toolCalls?.length) return '';
  const rows = toolCalls
    .map((tc) => {
      const name = tc.function?.name || 'unknown';
      const args = tc.function?.arguments || '{}';
      const summary = summarizeToolCall(name, args);
      const raw = (() => {
        try {
          return JSON.stringify(parseToolArgs(args), null, 2);
        } catch (_) {
          return String(args);
        }
      })();
      return `
        <details class="agent-step">
          <summary class="agent-step-summary">
            <span class="agent-step-dot"></span>
            <span class="agent-step-text">${escapeHtml(summary)}</span>
            <span class="agent-step-chevron">详情</span>
          </summary>
          <pre class="agent-step-raw">${escapeHtml(raw)}</pre>
        </details>`;
    })
    .join('');
  return `<div class="agent-steps">${rows}</div>`;
}

function renderToolResultBlock(msg) {
  const summary = summarizeToolResult(msg.name, msg.content);
  const statusClass = summary.ok ? 'is-ok' : 'is-fail';
  let raw = String(msg.content || '');
  try {
    raw = JSON.stringify(JSON.parse(msg.content), null, 2);
  } catch (_) {
    /* keep */
  }
  return `
    <div class="agent-step-result ${statusClass}">
      <div class="agent-step-result-main">
        <span class="agent-step-result-mark">${summary.ok ? '✓' : '!'}</span>
        <div class="agent-step-result-copy">
          <div class="agent-step-result-title">${escapeHtml(summary.title)}</div>
          ${summary.detail ? `<div class="agent-step-result-detail">${escapeHtml(summary.detail)}</div>` : ''}
        </div>
      </div>
      <details class="agent-step-result-more">
        <summary>原始结果</summary>
        <pre>${escapeHtml(raw)}</pre>
      </details>
    </div>`;
}

function renderMessageBubble(msg) {
  const div = document.createElement('div');
  div.className = `agent-msg agent-msg-${msg.role}`;
  if (msg.id) div.dataset.msgId = msg.id;

  if (msg.role === 'tool') {
    div.classList.add('agent-msg-tool-wrap');
    div.innerHTML = renderToolResultBlock(msg);
    return div;
  }

  const roleLabel = msg.role === 'user' ? '你' : msg.role === 'assistant' ? '助手' : '系统';
  const truncatedNote = msg.truncated ? ' <span class="agent-truncated">(已截断)</span>' : '';
  const toolCards = msg.role === 'assistant' ? renderToolCards(msg.toolCalls) : '';
  const body = escapeHtml(msg.content || '');
  const hideEmptyBody = msg.role === 'assistant' && !msg.content && msg.toolCalls?.length;

  div.innerHTML = `
    <div class="agent-msg-role">${escapeHtml(roleLabel)}${truncatedNote}</div>
    ${hideEmptyBody ? '' : `<div class="agent-msg-body">${body}</div>`}
    ${toolCards}
  `;
  return div;
}

/** Live chat turn: instant user bubble + streaming assistant. */
function createLiveTurnUi(getMessagesEl) {
  let streamEl = null;
  let bodyEl = null;
  let shownUserIds = new Set();
  let optimisticUser = false;

  function scroll() {
    const el = getMessagesEl();
    if (el) el.scrollTop = el.scrollHeight;
  }

  function appendUserOptimistic(text) {
    const el = getMessagesEl();
    if (!el) return;
    const bubble = renderMessageBubble({ role: 'user', content: text });
    bubble.dataset.optimistic = '1';
    el.appendChild(bubble);
    optimisticUser = true;
    scroll();
  }

  function onUserMessage(msg) {
    const el = getMessagesEl();
    if (!el || !msg) return;
    if (msg.id) shownUserIds.add(msg.id);
    if (optimisticUser) {
      const opt = el.querySelector('.agent-msg-user[data-optimistic="1"]');
      if (opt) {
        opt.dataset.optimistic = '0';
        if (msg.id) opt.dataset.msgId = msg.id;
      }
      optimisticUser = false;
      return;
    }
    el.appendChild(renderMessageBubble(msg));
    scroll();
  }

  function startAssistant() {
    const el = getMessagesEl();
    if (!el) return;
    if (streamEl) return;
    streamEl = renderMessageBubble({ role: 'assistant', content: '' });
    streamEl.classList.add('agent-msg-streaming');
    bodyEl = streamEl.querySelector('.agent-msg-body');
    if (bodyEl) bodyEl.textContent = '';
    el.appendChild(streamEl);
    scroll();
  }

  function appendDelta(text) {
    if (!text) return;
    if (!streamEl) startAssistant();
    if (bodyEl) bodyEl.textContent += text;
    scroll();
  }

  function clearStream() {
    if (streamEl) {
      streamEl.classList.remove('agent-msg-streaming');
      streamEl.remove();
    }
    streamEl = null;
    bodyEl = null;
  }

  function onPersistedMessage(msg) {
    const el = getMessagesEl();
    if (!el || !msg) return;

    if (msg.role === 'user') {
      onUserMessage(msg);
      return;
    }

    if (msg.role === 'assistant') {
      clearStream();
      el.appendChild(renderMessageBubble(msg));
      scroll();
      return;
    }

    // tool / system
    if (streamEl && !bodyEl?.textContent) clearStream();
    else if (streamEl) {
      streamEl.classList.remove('agent-msg-streaming');
      streamEl = null;
      bodyEl = null;
    }
    el.appendChild(renderMessageBubble(msg));
    scroll();
  }

  function onDone() {
    if (streamEl) {
      streamEl.classList.remove('agent-msg-streaming');
      streamEl = null;
      bodyEl = null;
    }
    optimisticUser = false;
  }

  function reset() {
    clearStream();
    optimisticUser = false;
  }

  return {
    appendUserOptimistic,
    startAssistant,
    appendDelta,
    onPersistedMessage,
    onDone,
    reset,
  };
}

function createConfirmController({ confirmEl, api, showToast, getActiveSessionId }) {
  const pendingConfirms = new Map();
  const confirmQueues = new Map();

  function sessionKey(agentSessionId) {
    return agentSessionId || '';
  }

  function enqueueConfirm(req) {
    pendingConfirms.set(req.confirmId, req);
    const key = sessionKey(req.agentSessionId);
    if (!confirmQueues.has(key)) confirmQueues.set(key, []);
    confirmQueues.get(key).push(req.confirmId);
  }

  function dequeueConfirm(confirmId) {
    pendingConfirms.delete(confirmId);
    for (const [key, queue] of confirmQueues) {
      const idx = queue.indexOf(confirmId);
      if (idx >= 0) {
        queue.splice(idx, 1);
        if (!queue.length) confirmQueues.delete(key);
        return key;
      }
    }
    return null;
  }

  function frontConfirmForSession(agentSessionId) {
    const queue = confirmQueues.get(sessionKey(agentSessionId));
    if (!queue?.length) return null;
    return pendingConfirms.get(queue[0]) ?? null;
  }

  function hideConfirmBar() {
    if (!confirmEl) return;
    confirmEl.classList.add('hidden');
    confirmEl.innerHTML = '';
  }

  function renderConfirmBar(req) {
    if (!confirmEl) return;
    const argsText = JSON.stringify(req.args ?? {}, null, 2);
    confirmEl.classList.remove('hidden');
    confirmEl.innerHTML = `
      <h3 class="agent-confirm-title">需要确认：${escapeHtml(req.toolName || '')}</h3>
      <p class="agent-confirm-meta">${escapeHtml(req.reason || '')} · 风险：${escapeHtml(riskLabel(req.riskLevel))}</p>
      <pre class="agent-confirm-args">${escapeHtml(argsText)}</pre>
      <div class="agent-confirm-actions">
        <button type="button" class="btn-primary" data-decision="allow-once">允许一次</button>
        <button type="button" class="btn-secondary" data-decision="allow-session">允许本会话同类</button>
        <button type="button" class="btn-text" data-decision="deny">拒绝</button>
      </div>
    `;
    confirmEl.querySelectorAll('[data-decision]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const decision = btn.getAttribute('data-decision');
        await respondConfirm(req.confirmId, decision);
      });
    });
    confirmEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function respondConfirm(confirmId, decision) {
    try {
      await api.agentConfirmResponse({ confirmId, decision });
    } catch (err) {
      showToast(`确认响应失败: ${err.message}`, 'error');
      return;
    }
    const sessionId = dequeueConfirm(confirmId);
    if (sessionId === sessionKey(getActiveSessionId())) {
      showConfirmForActiveSession();
    }
  }

  function showConfirmForActiveSession() {
    const activeId = getActiveSessionId();
    if (!activeId) {
      hideConfirmBar();
      return;
    }
    const front = frontConfirmForSession(activeId);
    if (front) renderConfirmBar(front);
    else hideConfirmBar();
  }

  function onConfirmRequest(req) {
    if (!req?.confirmId) return;
    enqueueConfirm(req);
    if (req.agentSessionId && req.agentSessionId !== getActiveSessionId()) {
      showToast(`会话 ${req.toolName || '工具'} 等待确认`, 'info', 4000);
      return;
    }
    const front = frontConfirmForSession(getActiveSessionId());
    if (front?.confirmId === req.confirmId) renderConfirmBar(req);
  }

  return {
    hideConfirmBar,
    showConfirmForActiveSession,
    onConfirmRequest,
  };
}

function createSessionAgentPanel(sshSessionId, getServerId, deps) {
  const { api, showToast, onOpenInSidebar } = deps;
  confirmBus.init(api);

  const panel = document.createElement('div');
  panel.className = 'agent-panel';
  panel.dataset.sessionId = sshSessionId;

  panel.innerHTML = `
    <header class="agent-pane-header">
      <span class="agent-pane-bound">已绑定当前 SSH 会话</span>
      <button type="button" class="btn-text agent-pane-sidebar-btn" data-action="open-sidebar">在侧栏打开</button>
    </header>
    <div class="agent-pane-messages agent-messages" role="log" aria-live="polite"></div>
    <div class="agent-confirm-bar hidden" role="alertdialog"></div>
    <footer class="agent-compose">
      <textarea class="agent-pane-input" rows="3" placeholder="输入消息，Enter 发送，Shift+Enter 换行…"></textarea>
      <button type="button" class="btn-primary agent-pane-send">发送</button>
    </footer>
  `;

  const messagesEl = panel.querySelector('.agent-pane-messages');
  const confirmEl = panel.querySelector('.agent-confirm-bar');
  const inputEl = panel.querySelector('.agent-pane-input');
  const sendBtn = panel.querySelector('.agent-pane-send');
  let agentSessionId = null;
  let sending = false;
  let paneActive = false;
  const live = createLiveTurnUi(() => messagesEl);

  const confirm = createConfirmController({
    confirmEl,
    api,
    showToast,
    getActiveSessionId: () => (paneActive ? agentSessionId : null),
  });

  const unsubConfirm = confirmBus.subscribe((req) => {
    if (paneActive) confirm.onConfirmRequest(req);
  });

  const unsubTurn = api.onAgentTurnEvent?.((ev) => {
    if (!paneActive || !ev || ev.agentSessionId !== agentSessionId) return;
    if (ev.type === 'user') live.onPersistedMessage(ev.message);
    else if (ev.type === 'assistant_start') live.startAssistant();
    else if (ev.type === 'assistant_delta') live.appendDelta(ev.text);
    else if (ev.type === 'message') live.onPersistedMessage(ev.message);
    else if (ev.type === 'done') live.onDone();
    else if (ev.type === 'error') {
      live.onDone();
      showToast(ev.error || 'Agent 出错', 'error');
    }
  });

  async function findBoundAgentSession() {
    const list = await api.agentListSessions();
    if (!Array.isArray(list)) return null;
    for (const entry of list) {
      const session = await api.agentGetSession(entry.id);
      const match = session?.targets?.find(
        (t) => t.type === 'ssh' && t.sshSessionId === sshSessionId
      );
      if (match) return session;
    }
    return null;
  }

  async function ensureAgentSession() {
    const serverId = getServerId();
    if (!serverId) throw new Error('未绑定服务器');

    const targets = [{ type: 'ssh', serverId, sshSessionId }];
    if (agentSessionId) {
      await api.agentSetTargets(agentSessionId, targets);
      return agentSessionId;
    }

    const existing = await findBoundAgentSession();
    if (existing) {
      agentSessionId = existing.id;
      await api.agentSetTargets(agentSessionId, targets);
      return agentSessionId;
    }

    const created = await api.agentCreateSession({});
    agentSessionId = created.id;
    await api.agentSetTargets(agentSessionId, targets);
    return agentSessionId;
  }

  async function renderMessages() {
    if (!messagesEl || !agentSessionId) return;
    messagesEl.innerHTML = '';
    try {
      const session = await api.agentGetSession(agentSessionId);
      if (!session) {
        showToast('Agent 会话不存在', 'error');
        agentSessionId = null;
        return;
      }
      for (const msg of session.messages || []) {
        messagesEl.appendChild(renderMessageBubble(msg));
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } catch (err) {
      showToast(`加载消息失败: ${err.message}`, 'error');
    }
  }

  async function sendMessage() {
    if (sending || !agentSessionId || !inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;

    sending = true;
    sendBtn.disabled = true;
    inputEl.value = '';
    live.appendUserOptimistic(text);
    live.startAssistant();

    try {
      await api.agentSend({ agentSessionId, userText: text });
      live.onDone();
    } catch (err) {
      live.onDone();
      showToast(`发送失败: ${err.message}`, 'error');
      try {
        await api.agentAppendMessage(agentSessionId, {
          role: 'assistant',
          content: `错误: ${err.message}`,
        });
        await renderMessages();
      } catch (_) {
        /* ignore secondary failure */
      }
    } finally {
      sending = false;
      sendBtn.disabled = false;
      if (paneActive) inputEl.focus();
    }
  }

  async function init() {
    paneActive = true;
    try {
      await ensureAgentSession();
      await renderMessages();
      confirm.showConfirmForActiveSession();
      inputEl?.focus();
    } catch (err) {
      showToast(`Agent 初始化失败: ${err.message}`, 'error');
    }
  }

  function deactivate() {
    paneActive = false;
    confirm.hideConfirmBar();
  }

  function destroy() {
    deactivate();
    live.reset();
    unsubConfirm();
    unsubTurn?.();
  }

  panel.querySelector('[data-action="open-sidebar"]')?.addEventListener('click', async () => {
    try {
      const id = await ensureAgentSession();
      onOpenInSidebar?.(id);
    } catch (err) {
      showToast(`打开侧栏失败: ${err.message}`, 'error');
    }
  });

  sendBtn?.addEventListener('click', sendMessage);
  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  return {
    panel,
    init,
    deactivate,
    destroy,
    refresh: renderMessages,
  };
}

function createAgentModule(deps) {
  const { api, showToast, uid, onEnterWorkbench, onLeaveWorkbench } = deps;
  confirmBus.init(api);

  const els = {
    browser: document.getElementById('agent-browser'),
    browserList: document.getElementById('agent-session-list'),
    sessionCount: document.getElementById('agent-count'),
    workbench: document.getElementById('agent-workbench'),
    wbTitle: document.getElementById('agent-wb-title'),
    targetType: document.getElementById('agent-target-type'),
    targetSelect: document.getElementById('agent-target-select'),
    k8sClusterSelect: document.getElementById('agent-k8s-cluster-select'),
    k8sNamespace: document.getElementById('agent-k8s-namespace'),
    messages: document.getElementById('agent-messages'),
    input: document.getElementById('agent-input'),
    sendBtn: document.getElementById('agent-send'),
    deleteBtn: document.getElementById('agent-delete-session'),
    confirmBar: document.getElementById('agent-confirm-bar'),
  };

  let sessions = [];
  let savedConnections = [];
  let savedClusters = [];
  let activeSessionId = null;
  let sending = false;
  const live = createLiveTurnUi(() => els.messages);

  const confirm = createConfirmController({
    confirmEl: els.confirmBar,
    api,
    showToast,
    getActiveSessionId: () => activeSessionId,
  });

  const unsubConfirm = confirmBus.subscribe((req) => confirm.onConfirmRequest(req));
  const unsubTurn = api.onAgentTurnEvent?.((ev) => {
    if (!ev || ev.agentSessionId !== activeSessionId) return;
    if (ev.type === 'user') live.onPersistedMessage(ev.message);
    else if (ev.type === 'assistant_start') live.startAssistant();
    else if (ev.type === 'assistant_delta') live.appendDelta(ev.text);
    else if (ev.type === 'message') live.onPersistedMessage(ev.message);
    else if (ev.type === 'done') {
      live.onDone();
      loadSessions();
    } else if (ev.type === 'error') {
      live.onDone();
      showToast(ev.error || 'Agent 出错', 'error');
    }
  });

  void unsubConfirm;
  void unsubTurn;

  function showWorkbench(show) {
    els.browser?.classList.toggle('hidden', show);
    els.workbench?.classList.toggle('hidden', !show);
    if (show) onEnterWorkbench?.();
    else onLeaveWorkbench?.();
  }

  async function loadConnections() {
    try {
      savedConnections = await api.listConnections();
      if (!Array.isArray(savedConnections)) savedConnections = [];
    } catch (_) {
      savedConnections = [];
    }
  }

  async function loadClusters() {
    try {
      savedClusters = await api.k8sListClusters?.();
      if (!Array.isArray(savedClusters)) savedClusters = [];
    } catch (_) {
      savedClusters = [];
    }
  }

  function currentTargetType(session) {
    const k8s = session?.targets?.find((t) => t.type === 'k8s' && t.clusterId);
    if (k8s) return 'k8s';
    return 'ssh';
  }

  function updateTargetControlsVisibility(type) {
    const isK8s = type === 'k8s';
    els.targetSelect?.classList.toggle('hidden', isK8s);
    els.k8sClusterSelect?.classList.toggle('hidden', !isK8s);
    els.k8sNamespace?.classList.toggle('hidden', !isK8s);
  }

  function buildTargetsFromUi() {
    const type = els.targetType?.value || 'ssh';
    if (type === 'k8s') {
      const clusterId = els.k8sClusterSelect?.value || '';
      if (!clusterId) return [];
      const cluster = savedClusters.find((c) => c.id === clusterId);
      const namespace = (els.k8sNamespace?.value || '').trim();
      const target = {
        type: 'k8s',
        clusterId,
        context: cluster?.defaultContext || undefined,
      };
      if (namespace) target.namespace = namespace;
      return [target];
    }
    const serverId = els.targetSelect?.value || '';
    return serverId ? [{ type: 'ssh', serverId }] : [];
  }

  async function loadSessions() {
    try {
      sessions = await api.agentListSessions();
      if (!Array.isArray(sessions)) sessions = [];
    } catch (err) {
      sessions = [];
      showToast(`读取 Agent 会话失败: ${err.message}`, 'error');
    }
    if (els.sessionCount) els.sessionCount.textContent = String(sessions.length);
    renderSessionList();
  }

  function renderSessionList() {
    if (!els.browserList) return;
    els.browserList.innerHTML = '';
    if (!sessions.length) {
      const li = document.createElement('li');
      li.className = 'empty-hint';
      li.textContent = '暂无对话，点击右上角新建';
      els.browserList.appendChild(li);
      return;
    }
    for (const s of sessions) {
      const li = document.createElement('li');
      li.className = 'browser-card agent-session-card';
      const preview = s.messageCount ? `${s.messageCount} 条消息` : '暂无消息';
      li.innerHTML = `
        <div class="browser-card-body">
          <div class="browser-card-title">${escapeHtml(s.title || '新对话')}</div>
          <div class="browser-card-sub">${escapeHtml(preview)}</div>
        </div>
        <button type="button" class="browser-card-edit agent-card-delete" data-action="delete" title="删除">×</button>
      `;
      li.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteSession(s.id);
      });
      li.addEventListener('click', () => openSession(s.id));
      els.browserList.appendChild(li);
    }
  }

  async function deleteSession(id) {
    try {
      await api.agentDeleteSession(id);
    } catch (err) {
      showToast(`删除失败: ${err.message}`, 'error');
      return;
    }
    if (activeSessionId === id) {
      activeSessionId = null;
      showWorkbench(false);
    }
    await loadSessions();
    showToast('会话已删除', 'info', 2000);
  }

  async function createSession() {
    try {
      const session = await api.agentCreateSession({});
      await loadSessions();
      openSession(session.id);
    } catch (err) {
      showToast(`新建会话失败: ${err.message}`, 'error');
    }
  }

  async function openSession(id) {
    activeSessionId = id;
    showWorkbench(true);
    await loadConnections();
    await loadClusters();
    await renderMessages();
    confirm.showConfirmForActiveSession();
  }

  function hideConfirmBar() {
    confirm.hideConfirmBar();
  }

  function renderTargetSelect(session) {
    const type = currentTargetType(session);
    if (els.targetType) els.targetType.value = type;
    updateTargetControlsVisibility(type);

    const sshTarget = session?.targets?.find((t) => t.type === 'ssh' && t.serverId);
    if (els.targetSelect) {
      els.targetSelect.innerHTML = '<option value="">未绑定</option>';
      for (const c of savedConnections) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.label || c.host || c.id;
        if (c.id === sshTarget?.serverId) opt.selected = true;
        els.targetSelect.appendChild(opt);
      }
    }

    const k8sTarget = session?.targets?.find((t) => t.type === 'k8s' && t.clusterId);
    if (els.k8sClusterSelect) {
      els.k8sClusterSelect.innerHTML = '<option value="">未绑定</option>';
      for (const c of savedClusters) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || c.id;
        if (c.id === k8sTarget?.clusterId) opt.selected = true;
        els.k8sClusterSelect.appendChild(opt);
      }
    }
    if (els.k8sNamespace) {
      els.k8sNamespace.value = k8sTarget?.namespace || '';
    }
  }

  async function onTargetChange() {
    if (!activeSessionId) return;
    const targets = buildTargetsFromUi();
    try {
      await api.agentSetTargets(activeSessionId, targets);
    } catch (err) {
      showToast(`绑定目标失败: ${err.message}`, 'error');
    }
  }

  async function onTargetTypeChange() {
    updateTargetControlsVisibility(els.targetType?.value || 'ssh');
    await onTargetChange();
  }

  async function renderMessages() {
    if (!els.messages || !activeSessionId) return;
    els.messages.innerHTML = '';
    try {
      const session = await api.agentGetSession(activeSessionId);
      if (!session) {
        showToast('会话不存在', 'error');
        activeSessionId = null;
        showWorkbench(false);
        await loadSessions();
        return;
      }
      if (els.wbTitle) els.wbTitle.textContent = session.title || '新对话';
      renderTargetSelect(session);
      for (const msg of session.messages || []) {
        els.messages.appendChild(renderMessageBubble(msg));
      }
      els.messages.scrollTop = els.messages.scrollHeight;
    } catch (err) {
      showToast(`加载消息失败: ${err.message}`, 'error');
    }
  }

  async function sendMessage() {
    if (sending || !activeSessionId || !els.input) return;
    const text = els.input.value.trim();
    if (!text) return;

    sending = true;
    if (els.sendBtn) els.sendBtn.disabled = true;
    els.input.value = '';
    live.appendUserOptimistic(text);
    live.startAssistant();

    try {
      await api.agentSend({ agentSessionId: activeSessionId, userText: text });
      live.onDone();
      await loadSessions();
      const session = await api.agentGetSession(activeSessionId);
      if (session && els.wbTitle) els.wbTitle.textContent = session.title || '新对话';
    } catch (err) {
      live.onDone();
      showToast(`发送失败: ${err.message}`, 'error');
      try {
        await api.agentAppendMessage(activeSessionId, {
          role: 'assistant',
          content: `错误: ${err.message}`,
        });
        await renderMessages();
      } catch (_) {
        /* ignore secondary failure */
      }
    } finally {
      sending = false;
      if (els.sendBtn) els.sendBtn.disabled = false;
      els.input?.focus();
    }
  }

  function bindEvents() {
    document.getElementById('btn-new-agent-session')?.addEventListener('click', createSession);
    document.getElementById('agent-wb-back')?.addEventListener('click', () => {
      activeSessionId = null;
      hideConfirmBar();
      showWorkbench(false);
    });
    els.deleteBtn?.addEventListener('click', () => {
      if (activeSessionId) deleteSession(activeSessionId);
    });
    els.targetType?.addEventListener('change', onTargetTypeChange);
    els.targetSelect?.addEventListener('change', onTargetChange);
    els.k8sClusterSelect?.addEventListener('change', onTargetChange);
    els.k8sNamespace?.addEventListener('change', onTargetChange);
    els.k8sNamespace?.addEventListener('blur', onTargetChange);
    els.sendBtn?.addEventListener('click', sendMessage);
    els.input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  bindEvents();
  loadSessions();

  return {
    loadSessions,
    openSessionInWorkbench: openSession,
    isInWorkbench: () => !!activeSessionId,
    leaveWorkbench: () => {
      activeSessionId = null;
      hideConfirmBar();
      showWorkbench(false);
    },
    destroy: () => unsubConfirm(),
  };
}

window.LocalWebSSHAgent = { createAgentModule, createSessionAgentPanel };
