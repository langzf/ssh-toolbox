/* global escapeHtml */

function createAgentModule(deps) {
  const { api, showToast, uid, onEnterWorkbench, onLeaveWorkbench } = deps;

  const els = {
    browser: document.getElementById('agent-browser'),
    browserList: document.getElementById('agent-session-list'),
    sessionCount: document.getElementById('agent-count'),
    workbench: document.getElementById('agent-workbench'),
    wbTitle: document.getElementById('agent-wb-title'),
    targetSelect: document.getElementById('agent-target-select'),
    messages: document.getElementById('agent-messages'),
    input: document.getElementById('agent-input'),
    sendBtn: document.getElementById('agent-send'),
    deleteBtn: document.getElementById('agent-delete-session'),
    confirmBar: document.getElementById('agent-confirm-bar'),
  };

  let sessions = [];
  let savedConnections = [];
  let activeSessionId = null;
  let sending = false;
  /** @type {Map<string, object>} */
  const pendingConfirms = new Map();

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
    await renderMessages();
    for (const req of pendingConfirms.values()) {
      if (req.agentSessionId === id) {
        renderConfirmBar(req);
        break;
      }
    }
  }

  function riskLabel(level) {
    if (level === 'danger') return '高危';
    if (level === 'write') return '写操作';
    return '只读';
  }

  function hideConfirmBar() {
    if (!els.confirmBar) return;
    els.confirmBar.classList.add('hidden');
    els.confirmBar.innerHTML = '';
  }

  function renderConfirmBar(req) {
    if (!els.confirmBar) return;
    const argsText = JSON.stringify(req.args ?? {}, null, 2);
    els.confirmBar.classList.remove('hidden');
    els.confirmBar.innerHTML = `
      <h3 id="agent-confirm-title" class="agent-confirm-title">需要确认：${escapeHtml(req.toolName || '')}</h3>
      <p class="agent-confirm-meta">${escapeHtml(req.reason || '')} · 风险：${escapeHtml(riskLabel(req.riskLevel))}</p>
      <pre class="agent-confirm-args">${escapeHtml(argsText)}</pre>
      <div class="agent-confirm-actions">
        <button type="button" class="btn-primary" data-decision="allow-once">允许一次</button>
        <button type="button" class="btn-secondary" data-decision="allow-session">允许本会话同类</button>
        <button type="button" class="btn-text" data-decision="deny">拒绝</button>
      </div>
    `;
    els.confirmBar.querySelectorAll('[data-decision]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const decision = btn.getAttribute('data-decision');
        await respondConfirm(req.confirmId, decision);
      });
    });
    els.confirmBar.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function respondConfirm(confirmId, decision) {
    try {
      await api.agentConfirmResponse({ confirmId, decision });
    } catch (err) {
      showToast(`确认响应失败: ${err.message}`, 'error');
      return;
    }
    pendingConfirms.delete(confirmId);
    if (!pendingConfirms.size) hideConfirmBar();
  }

  function onConfirmRequest(req) {
    if (!req?.confirmId) return;
    pendingConfirms.set(req.confirmId, req);
    if (req.agentSessionId && req.agentSessionId !== activeSessionId) {
      showToast(`会话 ${req.toolName || '工具'} 等待确认`, 'info', 4000);
      return;
    }
    renderConfirmBar(req);
  }

  function renderTargetSelect(session) {
    if (!els.targetSelect) return;
    const current = session?.targets?.find((t) => t.type === 'ssh')?.serverId || '';
    els.targetSelect.innerHTML = '<option value="">未绑定</option>';
    for (const c of savedConnections) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label || c.host || c.id;
      if (c.id === current) opt.selected = true;
      els.targetSelect.appendChild(opt);
    }
  }

  async function onTargetChange() {
    if (!activeSessionId || !els.targetSelect) return;
    const serverId = els.targetSelect.value;
    const targets = serverId ? [{ type: 'ssh', serverId }] : [];
    try {
      await api.agentSetTargets(activeSessionId, targets);
    } catch (err) {
      showToast(`绑定目标失败: ${err.message}`, 'error');
    }
  }

  function renderToolCards(toolCalls) {
    if (!toolCalls?.length) return '';
    const cards = toolCalls
      .map((tc) => {
        const name = tc.function?.name || 'unknown';
        const args = tc.function?.arguments || '{}';
        return `<details class="agent-tool-card"><summary>🔧 ${escapeHtml(name)}</summary><pre>${escapeHtml(args)}</pre></details>`;
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
    els.targetSelect?.addEventListener('change', onTargetChange);
    els.sendBtn?.addEventListener('click', sendMessage);
    els.input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    api.onAgentConfirmRequest?.(onConfirmRequest);
  }

  bindEvents();
  loadSessions();

  return {
    loadSessions,
    isInWorkbench: () => !!activeSessionId,
    leaveWorkbench: () => {
      activeSessionId = null;
      hideConfirmBar();
      showWorkbench(false);
    },
  };
}

window.LocalWebSSHAgent = { createAgentModule };
