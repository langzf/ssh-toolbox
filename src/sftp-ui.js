/* global escapeHtml */

function formatSftpSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatSftpTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function parentSftpPath(dir) {
  if (!dir || dir === '/') return '/';
  const parts = dir.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
}

function joinSftpPath(dir, name) {
  if (!dir || dir === '/') return `/${name}`;
  return `${dir.replace(/\/$/, '')}/${name}`;
}

function createSftpPanel(sessionId, api, showToast) {
  const panel = document.createElement('div');
  panel.className = 'sftp-panel';
  panel.dataset.sessionId = sessionId;

  panel.innerHTML = `
    <div class="sftp-toolbar">
      <button type="button" class="sftp-btn" data-action="up" title="上级目录">↑</button>
      <button type="button" class="sftp-btn" data-action="refresh" title="刷新">↻</button>
      <input type="text" class="sftp-path" readonly />
      <button type="button" class="sftp-btn sftp-btn-primary" data-action="upload">上传</button>
      <button type="button" class="sftp-btn" data-action="download">下载</button>
      <button type="button" class="sftp-btn" data-action="mkdir">新建文件夹</button>
      <button type="button" class="sftp-btn sftp-btn-danger" data-action="delete">删除</button>
    </div>
    <p class="sftp-status" aria-live="polite"></p>
    <div class="sftp-table-wrap">
      <table class="sftp-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>大小</th>
            <th>修改时间</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

  const pathInput = panel.querySelector('.sftp-path');
  const tbody = panel.querySelector('tbody');
  const statusEl = panel.querySelector('.sftp-status');

  let remotePath = '/';
  let selected = null;
  let loading = false;
  let entries = [];

  function setStatus(text, isError = false) {
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', isError);
  }

  function renderRows() {
    tbody.innerHTML = '';
    if (!entries.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="3" class="sftp-empty">此目录为空</td>';
      tbody.appendChild(tr);
      return;
    }
    for (const item of entries) {
      const tr = document.createElement('tr');
      tr.dataset.name = item.name;
      tr.dataset.isDirectory = item.isDirectory ? '1' : '0';
      if (selected?.name === item.name) tr.classList.add('selected');
      tr.innerHTML = `
        <td class="sftp-name">
          <span class="sftp-kind">${item.isDirectory ? '📁' : '📄'}</span>
          ${escapeHtml(item.name)}
        </td>
        <td>${item.isDirectory ? '—' : formatSftpSize(item.size)}</td>
        <td>${formatSftpTime(item.mtime)}</td>
      `;
      tr.addEventListener('click', () => {
        selected = item;
        tbody.querySelectorAll('tr.selected').forEach((r) => r.classList.remove('selected'));
        tr.classList.add('selected');
      });
      tr.addEventListener('dblclick', () => {
        if (item.isDirectory) {
          remotePath = joinSftpPath(remotePath, item.name);
          loadDir();
        }
      });
      tbody.appendChild(tr);
    }
  }

  async function loadDir() {
    if (loading) return;
    loading = true;
    selected = null;
    pathInput.value = remotePath;
    setStatus('加载中…');
    try {
      entries = await api.sftpList(sessionId, remotePath);
      renderRows();
      setStatus(`${entries.length} 项`);
    } catch (err) {
      entries = [];
      renderRows();
      setStatus(err.message || String(err), true);
      showToast(`SFTP: ${err.message}`, 'error', 5000);
    } finally {
      loading = false;
    }
  }

  async function init() {
    try {
      remotePath = await api.sftpHome(sessionId);
    } catch {
      remotePath = '/';
    }
    await loadDir();
  }

  panel.querySelector('[data-action="up"]').addEventListener('click', () => {
    remotePath = parentSftpPath(remotePath);
    loadDir();
  });

  panel.querySelector('[data-action="refresh"]').addEventListener('click', () => loadDir());

  panel.querySelector('[data-action="upload"]').addEventListener('click', async () => {
    setStatus('上传中…');
    try {
      const result = await api.sftpUpload(sessionId, remotePath);
      if (result.canceled) {
        setStatus('');
        return;
      }
      showToast(`已上传 ${result.uploaded.length} 个文件`, 'success');
      await loadDir();
    } catch (err) {
      setStatus(err.message, true);
      showToast(`上传失败: ${err.message}`, 'error', 5000);
    }
  });

  panel.querySelector('[data-action="download"]').addEventListener('click', async () => {
    if (!selected || selected.isDirectory) {
      showToast('请选择一个文件', 'info');
      return;
    }
    const remoteFile = joinSftpPath(remotePath, selected.name);
    setStatus('下载中…');
    try {
      const result = await api.sftpDownload(sessionId, remoteFile, selected.name);
      if (result.canceled) {
        setStatus('');
        return;
      }
      showToast(`已保存到 ${result.localPath}`, 'success', 4500);
      setStatus('下载完成');
    } catch (err) {
      setStatus(err.message, true);
      showToast(`下载失败: ${err.message}`, 'error', 5000);
    }
  });

  panel.querySelector('[data-action="mkdir"]').addEventListener('click', async () => {
    const name = window.prompt('新建文件夹名称');
    if (!name?.trim()) return;
    const target = joinSftpPath(remotePath, name.trim());
    try {
      await api.sftpMkdir(sessionId, target);
      showToast('文件夹已创建', 'success');
      await loadDir();
    } catch (err) {
      showToast(`创建失败: ${err.message}`, 'error', 5000);
    }
  });

  panel.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!selected) {
      showToast('请先选择要删除的项', 'info');
      return;
    }
    const label = selected.isDirectory ? '文件夹' : '文件';
    if (!window.confirm(`确定删除${label}「${selected.name}」？`)) return;
    const target = joinSftpPath(remotePath, selected.name);
    try {
      await api.sftpDelete(sessionId, target, selected.isDirectory);
      showToast('已删除', 'success');
      await loadDir();
    } catch (err) {
      showToast(`删除失败: ${err.message}`, 'error', 5000);
    }
  });

  return { panel, init, refresh: loadDir };
}

window.LocalWebSSHSftp = { createSftpPanel };
