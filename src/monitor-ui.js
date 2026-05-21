/* global escapeHtml */

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(1)} GB`;
}

function formatUptime(sec) {
  if (!sec) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}天 ${h}小时`;
  if (h > 0) return `${h}小时 ${m}分`;
  return `${m} 分钟`;
}

function metricBar(label, percent, detail, accent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return `
    <div class="metric-card">
      <div class="metric-card-head">
        <span class="metric-label">${escapeHtml(label)}</span>
        <span class="metric-value">${p.toFixed(1)}%</span>
      </div>
      <div class="metric-bar-track">
        <div class="metric-bar-fill ${accent || ''}" style="width:${p}%"></div>
      </div>
      ${detail ? `<p class="metric-detail">${escapeHtml(detail)}</p>` : ''}
    </div>
  `;
}

function renderMetricsHtml(data) {
  if (data.error) {
    return `<div class="monitor-error">${escapeHtml(data.error)}</div>`;
  }

  const mem = data.memory || {};
  const cpu = data.cpu || {};
  const load = (data.load || []).map((x) => Number(x).toFixed(2)).join(' / ');
  const host = data.hostname || '—';
  const os = data.os || '—';

  let html = `
    <div class="monitor-summary">
      <span><strong>${escapeHtml(host)}</strong></span>
      <span>${escapeHtml(os)}</span>
      <span>负载 ${escapeHtml(load)}</span>
      <span>运行 ${formatUptime(data.uptimeSec)}</span>
    </div>
    <div class="monitor-grid">
      ${metricBar('CPU', cpu.percent, '处理器使用率', 'accent-cpu')}
      ${metricBar('内存', mem.percent, `${formatBytes(mem.used)} / ${formatBytes(mem.total)}`, 'accent-mem')}
    </div>
  `;

  if (data.disks?.length) {
    html += '<h3 class="monitor-section-title">磁盘</h3><div class="monitor-grid">';
    for (const d of data.disks) {
      html += metricBar(
        d.mount || '磁盘',
        d.percent,
        `${formatBytes(d.used)} / ${formatBytes(d.total)}`,
        'accent-disk'
      );
    }
    html += '</div>';
  }

  if (data.gpus?.length) {
    html += '<h3 class="monitor-section-title">GPU</h3><div class="monitor-gpu-list">';
    for (const g of data.gpus) {
      const memPct = g.memTotal ? Math.round((g.memUsed / g.memTotal) * 100) : 0;
      html += `
        <div class="metric-card gpu-card">
          <div class="metric-card-head">
            <span class="metric-label">${escapeHtml(g.name || 'GPU')}</span>
            <span class="metric-value">${g.utilPercent ?? 0}%</span>
          </div>
          <div class="metric-bar-track">
            <div class="metric-bar-fill accent-gpu" style="width:${g.utilPercent || 0}%"></div>
          </div>
          <p class="metric-detail">显存 ${formatBytes(g.memUsed)} / ${formatBytes(g.memTotal)} (${memPct}%)
            ${g.tempC != null ? ` · ${g.tempC}°C` : ''}</p>
        </div>
      `;
    }
    html += '</div>';
  }

  return html;
}

function createMonitorPanel(sessionId, api, showToast) {
  const panel = document.createElement('div');
  panel.className = 'monitor-panel';
  panel.dataset.sessionId = sessionId;

  panel.innerHTML = `
    <div class="monitor-toolbar">
      <span class="monitor-status">未采集</span>
      <label class="monitor-interval">
        刷新
        <select class="monitor-interval-select">
          <option value="3000">3 秒</option>
          <option value="5000" selected>5 秒</option>
          <option value="10000">10 秒</option>
          <option value="30000">30 秒</option>
        </select>
      </label>
      <button type="button" class="sftp-btn" data-action="refresh">立即刷新</button>
    </div>
    <div class="monitor-body">
      <p class="monitor-hint">通过 SSH 在远程主机执行采集脚本（约 1–2 秒）。Linux 推荐安装 python3；GPU 需 nvidia-smi。</p>
      <div class="monitor-content"></div>
    </div>
  `;

  const statusEl = panel.querySelector('.monitor-status');
  const contentEl = panel.querySelector('.monitor-content');
  const intervalSelect = panel.querySelector('.monitor-interval-select');
  let timer = null;
  let busy = false;

  async function fetchOnce() {
    if (busy) return;
    busy = true;
    statusEl.textContent = '采集中…';
    try {
      const data = await api.fetchMetrics(sessionId);
      contentEl.innerHTML = renderMetricsHtml(data);
      const t = new Date();
      statusEl.textContent = `已更新 ${t.toLocaleTimeString()}`;
    } catch (err) {
      contentEl.innerHTML = `<div class="monitor-error">${escapeHtml(err.message || String(err))}</div>`;
      statusEl.textContent = '采集失败';
      showToast(`监控: ${err.message}`, 'error', 4000);
    } finally {
      busy = false;
    }
  }

  function startPoll() {
    stopPoll();
    fetchOnce();
    const ms = Number(intervalSelect.value) || 5000;
    timer = setInterval(fetchOnce, ms);
  }

  function stopPoll() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  panel.querySelector('[data-action="refresh"]').addEventListener('click', () => fetchOnce());
  intervalSelect.addEventListener('change', () => {
    if (timer) startPoll();
  });

  return {
    panel,
    start: startPoll,
    stop: stopPoll,
    refresh: fetchOnce,
  };
}

window.LocalWebSSHMonitor = { createMonitorPanel };
