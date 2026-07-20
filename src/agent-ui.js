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
  agent_load_skill: '加载技能',
  'agent.load_skill': '加载技能',
  agent_read_skill_resource: '读取技能资料',
  'agent.read_skill_resource': '读取技能资料',
};

function renderToolCards(toolCalls) {
  if (!toolCalls?.length) return '';
  const cards = toolCalls
    .map((tc) => {
      const name = tc.function?.name || 'unknown';
      const label = TOOL_LABELS[name] || name;
      const args = tc.function?.arguments || '{}';
      return `<details class="agent-tool-card"><summary>🔧 ${escapeHtml(label)}</summary><pre>${escapeHtml(args)}</pre></details>`;
    })
    .join('');
  return `<div class="agent-tool-cards">${cards}</div>`;
}

function renderMessageBubble(msg) {
  const div = document.createElement('div');
  div.className = `agent-msg agent-msg-${msg.role}`;
  const roleLabel =
    msg.role === 'user'
      ? '你'
      : msg.role === 'assistant'
        ? '助手'
        : msg.role === 'system'
          ? '系统'
          : msg.role === 'tool'
            ? `工具 · ${msg.name || ''}`
            : '工具';
  const truncatedNote = msg.truncated ? ' <span class="agent-truncated">(已截断)</span>' : '';
  const toolCards = msg.role === 'assistant' ? renderToolCards(msg.toolCalls) : '';
  let body = escapeHtml(msg.content || '');
  if (msg.role === 'tool' && msg.content) {
    try {
      const parsed = JSON.parse(msg.content);
      body = escapeHtml(JSON.stringify(parsed, null, 2));
    } catch (_) {
      /* keep raw */
    }
  }
  div.innerHTML = `
    <div class="agent-msg-role">${escapeHtml(roleLabel)}${truncatedNote}</div>
    <div class="agent-msg-body">${body}</div>
    ${toolCards}
  `;
  return div;
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

  const confirm = createConfirmController({
    confirmEl,
    api,
    showToast,
    getActiveSessionId: () => (paneActive ? agentSessionId : null),
  });

  const unsubConfirm = confirmBus.subscribe((req) => {
    if (paneActive) confirm.onConfirmRequest(req);
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

    try {
      await api.agentSend({ agentSessionId, userText: text });
      await renderMessages();
    } catch (err) {
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
    unsubConfirm();
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

  const confirm = createConfirmController({
    confirmEl: els.confirmBar,
    api,
    showToast,
    getActiveSessionId: () => activeSessionId,
  });

  const unsubConfirm = confirmBus.subscribe((req) => {
    if (activeSessionId) confirm.onConfirmRequest(req);
  });

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
      li.className = 'browser-card';
      const preview = s.messageCount ? `${s.messageCount} 条消息` : '空对话';
      li.innerHTML = `
        <div class="browser-card-body">
          <div class="browser-card-title">${escapeHtml(s.title || '新对话')}</div>
          <div class="browser-card-sub">${escapeHtml(preview)}</div>
        </div>
        <div class="browser-card-actions">
          <button type="button" class="btn-text" data-action="open">打开</button>
          <button type="button" class="btn-text" data-action="delete">删除</button>
        </div>
      `;
      li.querySelector('[data-action="open"]').addEventListener('click', (e) => {
        e.stopPropagation();
        openSession(s.id);
      });
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

    try {
      await api.agentSend({ agentSessionId: activeSessionId, userText: text });
      await renderMessages();
      await loadSessions();
    } catch (err) {
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
