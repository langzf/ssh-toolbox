/* global escapeHtml */

function createAgentModule(deps) {
  const { api, showToast, uid, onEnterWorkbench, onLeaveWorkbench } = deps;

  const els = {
    browser: document.getElementById('agent-browser'),
    browserList: document.getElementById('agent-session-list'),
    sessionCount: document.getElementById('agent-count'),
    workbench: document.getElementById('agent-workbench'),
    wbTitle: document.getElementById('agent-wb-title'),
    messages: document.getElementById('agent-messages'),
    input: document.getElementById('agent-input'),
    sendBtn: document.getElementById('agent-send'),
    deleteBtn: document.getElementById('agent-delete-session'),
  };

  let sessions = [];
  let activeSessionId = null;
  let sending = false;

  function showWorkbench(show) {
    els.browser?.classList.toggle('hidden', show);
    els.workbench?.classList.toggle('hidden', !show);
    if (show) onEnterWorkbench?.();
    else onLeaveWorkbench?.();
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
    await renderMessages();
  }

  function chatHistoryFromMessages(messages) {
    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));
  }

  function renderMessageBubble(msg) {
    const div = document.createElement('div');
    div.className = `agent-msg agent-msg-${msg.role}`;
    const roleLabel =
      msg.role === 'user' ? '你' : msg.role === 'assistant' ? '助手' : msg.role === 'system' ? '系统' : '工具';
    const truncatedNote = msg.truncated ? ' <span class="agent-truncated">(已截断)</span>' : '';
    div.innerHTML = `
      <div class="agent-msg-role">${escapeHtml(roleLabel)}${truncatedNote}</div>
      <div class="agent-msg-body">${escapeHtml(msg.content || '')}</div>
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
      await api.agentAppendMessage(activeSessionId, { role: 'user', content: text });
      await renderMessages();
      await loadSessions();

      const session = await api.agentGetSession(activeSessionId);
      const history = chatHistoryFromMessages(session?.messages || []);
      const reply = await api.agentChat({ messages: history });
      const content = reply?.content ?? String(reply ?? '');
      await api.agentAppendMessage(activeSessionId, { role: 'assistant', content });
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
      showWorkbench(false);
    });
    els.deleteBtn?.addEventListener('click', () => {
      if (activeSessionId) deleteSession(activeSessionId);
    });
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
    isInWorkbench: () => !!activeSessionId,
    leaveWorkbench: () => {
      activeSessionId = null;
      showWorkbench(false);
    },
  };
}

window.LocalWebSSHAgent = { createAgentModule };
