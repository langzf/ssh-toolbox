/* global Terminal, escapeHtml */

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(1)} GB`;
}

function formatCpu(cores) {
  if (cores == null) return '—';
  const c = Number(cores);
  if (c < 0.01) return `${(c * 1000).toFixed(0)}m`;
  return c.toFixed(3);
}

function phaseClass(phase) {
  const p = (phase || '').toLowerCase();
  if (p === 'running') return 'k8s-phase-running';
  if (p === 'pending') return 'k8s-phase-pending';
  if (p === 'failed' || p === 'error') return 'k8s-phase-failed';
  return 'k8s-phase-other';
}

function createK8sModule(deps) {
  const { api, showToast, uid, appSettings, themesApi, createFitAddon } = deps;

  const els = {
    browser: document.getElementById('k8s-browser'),
    browserList: document.getElementById('k8s-cluster-list'),
    clusterCount: document.getElementById('k8s-count'),
    workbench: document.getElementById('k8s-workbench'),
    wbTitle: document.getElementById('k8s-wb-title'),
    wbContext: document.getElementById('k8s-wb-context'),
    nsList: document.getElementById('k8s-ns-list'),
    podList: document.getElementById('k8s-pod-list'),
    podDetail: document.getElementById('k8s-pod-detail'),
    containerSelect: document.getElementById('k8s-container-select'),
    logsView: document.getElementById('k8s-logs-view'),
    execHost: document.getElementById('k8s-exec-host'),
    metricsView: document.getElementById('k8s-metrics-view'),
    tailInput: document.getElementById('k8s-log-tail'),
    dialog: document.getElementById('k8s-cluster-dialog'),
    form: document.getElementById('k8s-cluster-form'),
    formError: document.getElementById('k8s-form-error'),
    contextSelect: document.getElementById('k8s-context-select'),
  };

  let clusters = [];
  let editingClusterId = null;
  let workbench = null;
  let logStreamId = null;
  let execSession = null;
  let unsubLog = [];
  let unsubExec = [];

  function showFormError(msg) {
    if (els.formError) els.formError.textContent = msg || '';
  }

  async function loadClusters() {
    try {
      clusters = await api.k8sListClusters();
      if (!Array.isArray(clusters)) clusters = [];
    } catch (err) {
      clusters = [];
      showToast(`读取 K8s 集群失败: ${err.message}`, 'error');
    }
    if (els.clusterCount) els.clusterCount.textContent = String(clusters.length);
    renderClusterList();
  }

  async function persistClusters() {
    clusters = await api.k8sSaveClusters(clusters);
    if (els.clusterCount) els.clusterCount.textContent = String(clusters.length);
    renderClusterList();
  }

  function renderClusterList() {
    if (!els.browserList) return;
    els.browserList.innerHTML = '';
    if (!clusters.length) {
      const li = document.createElement('li');
      li.className = 'empty-hint';
      li.textContent = '暂无集群，点击右上角导入 kubeconfig';
      els.browserList.appendChild(li);
      return;
    }
    for (const c of clusters) {
      const li = document.createElement('li');
      li.className = 'browser-card';
      li.innerHTML = `
        <div class="browser-card-body">
          <div class="browser-card-title">${escapeHtml(c.name)}</div>
          <div class="browser-card-sub">上下文: ${escapeHtml(c.defaultContext || '默认')}</div>
        </div>
        <div class="browser-card-actions">
          <button type="button" class="btn-text" data-action="edit">编辑</button>
          <button type="button" class="btn-text" data-action="connect">连接</button>
        </div>
      `;
      li.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
        e.stopPropagation();
        openClusterDialog(c);
      });
      li.querySelector('[data-action="connect"]').addEventListener('click', (e) => {
        e.stopPropagation();
        connectCluster(c);
      });
      li.addEventListener('click', () => connectCluster(c));
      els.browserList.appendChild(li);
    }
  }

  async function populateContextSelect(yaml, selected) {
    if (!els.contextSelect) return;
    els.contextSelect.innerHTML = '';
    if (!yaml?.trim()) return;
    try {
      const { contexts, current } = await api.k8sParseContexts(yaml);
      for (const ctx of contexts) {
        const opt = document.createElement('option');
        opt.value = ctx.name;
        opt.textContent = ctx.name;
        els.contextSelect.appendChild(opt);
      }
      els.contextSelect.value = selected || current || contexts[0]?.name || '';
    } catch (err) {
      showFormError(err.message);
    }
  }

  function openClusterDialog(cluster = null) {
    editingClusterId = cluster?.id || null;
    els.form.reset();
    showFormError('');
    if (cluster) {
      els.form.name.value = cluster.name;
      els.form.prometheusUrl.value = cluster.prometheusUrl || '';
      els.form.kubeconfigYaml.value = cluster.kubeconfigYaml || '';
      populateContextSelect(cluster.kubeconfigYaml, cluster.defaultContext);
    } else {
      els.contextSelect.innerHTML = '';
    }
    document.getElementById('k8s-dialog-title').textContent = cluster ? '编辑集群' : '导入集群';
    document.getElementById('k8s-btn-delete').classList.toggle('hidden', !cluster);
    els.dialog.showModal();
  }

  async function saveClusterFromForm(e) {
    e.preventDefault();
    const fd = new FormData(els.form);
    const name = (fd.get('name') || '').trim();
    const yaml = (fd.get('kubeconfigYaml') || '').trim();
    if (!name) {
      showFormError('请填写集群名称');
      return;
    }
    if (!yaml) {
      showFormError('请粘贴或导入 kubeconfig');
      return;
    }
    const entry = {
      id: editingClusterId || uid('k8c'),
      name,
      kubeconfigYaml: yaml,
      defaultContext: fd.get('defaultContext') || '',
      prometheusUrl: (fd.get('prometheusUrl') || '').trim(),
      updatedAt: new Date().toISOString(),
    };
    const idx = clusters.findIndex((c) => c.id === entry.id);
    if (idx >= 0) clusters[idx] = entry;
    else clusters.push(entry);
    await persistClusters();
    els.dialog.close();
    showToast('集群已保存', 'success');
  }

  async function importKubeconfigFile() {
    try {
      const picked = await api.k8sPickKubeconfig();
      if (!picked) return;
      els.form.kubeconfigYaml.value = picked.yaml;
      if (!els.form.name.value) {
        const base = picked.filePath.split(/[/\\]/).pop();
        els.form.name.value = base.replace(/\.(yaml|yml)$/i, '') || '集群';
      }
      await populateContextSelect(picked.yaml);
      showToast('已导入 kubeconfig', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function testClusterInDialog() {
    const yaml = els.form.kubeconfigYaml.value.trim();
    const ctx = els.contextSelect.value;
    if (!yaml) {
      showFormError('请先填写 kubeconfig');
      return;
    }
    showFormError('');
    try {
      const res = await api.k8sTestConnection({ kubeconfigYaml: yaml, context: ctx });
      showToast(`连接成功 (${res.context})`, 'success');
    } catch (err) {
      showFormError(err.message);
    }
  }

  function clearLogStream() {
    if (logStreamId) {
      api.k8sLogsStreamStop(logStreamId).catch(() => {});
      logStreamId = null;
    }
  }

  function teardownExec() {
    if (execSession) {
      api.k8sExecStop(execSession.execId).catch(() => {});
      execSession.ro?.disconnect();
      execSession.term?.dispose();
      execSession = null;
    }
    unsubExec.forEach((fn) => fn());
    unsubExec = [];
  }

  function teardownWorkbenchListeners() {
    clearLogStream();
    teardownExec();
    unsubLog.forEach((fn) => fn());
    unsubLog = [];
  }

  async function connectCluster(cluster) {
    try {
      const res = await api.k8sTestConnection({
        clusterId: cluster.id,
        context: cluster.defaultContext,
      });
      workbench = {
        cluster,
        context: res.context || cluster.defaultContext,
        namespace: null,
        pod: null,
        pane: 'logs',
      };
      els.wbTitle.textContent = cluster.name;
      els.wbContext.textContent = workbench.context;
      teardownWorkbenchListeners();
      showWorkbench(true);
      deps.onEnterWorkbench?.();
      await loadNamespaces();
      showToast(`已连接 ${cluster.name}`, 'success');
    } catch (err) {
      showToast(err.message, 'error', 5000);
    }
  }

  function showWorkbench(show) {
    els.workbench?.classList.toggle('hidden', !show);
    if (!show) {
      teardownWorkbenchListeners();
      workbench = null;
    }
  }

  function wbPayload(extra = {}) {
    return {
      clusterId: workbench.cluster.id,
      context: workbench.context,
      ...extra,
    };
  }

  async function loadNamespaces() {
    if (!workbench) return;
    els.nsList.innerHTML = '<li class="empty-hint">加载中…</li>';
    try {
      const items = await api.k8sListNamespaces(wbPayload());
      els.nsList.innerHTML = '';
      if (!items.length) {
        els.nsList.innerHTML = '<li class="empty-hint">无命名空间</li>';
        return;
      }
      for (const ns of items) {
        const li = document.createElement('li');
        li.className = 'k8s-list-item';
        if (workbench.namespace === ns.name) li.classList.add('active');
        li.innerHTML = `<span>${escapeHtml(ns.name)}</span><span class="k8s-muted">${escapeHtml(ns.status || '')}</span>`;
        li.addEventListener('click', () => selectNamespace(ns.name));
        els.nsList.appendChild(li);
      }
      if (!workbench.namespace && items[0]) selectNamespace(items[0].name);
    } catch (err) {
      els.nsList.innerHTML = `<li class="empty-hint error">${escapeHtml(err.message)}</li>`;
    }
  }

  async function selectNamespace(name) {
    workbench.namespace = name;
    workbench.pod = null;
    els.nsList.querySelectorAll('.k8s-list-item').forEach((li) => {
      li.classList.toggle('active', li.querySelector('span')?.textContent === name);
    });
    await loadPods();
    clearPodDetail();
  }

  async function loadPods() {
    if (!workbench?.namespace) return;
    els.podList.innerHTML = '<li class="empty-hint">加载中…</li>';
    try {
      const pods = await api.k8sListPods(wbPayload({ namespace: workbench.namespace }));
      els.podList.innerHTML = '';
      if (!pods.length) {
        els.podList.innerHTML = '<li class="empty-hint">此命名空间无 Pod</li>';
        return;
      }
      for (const pod of pods) {
        const li = document.createElement('li');
        li.className = 'k8s-list-item';
        if (workbench.pod?.name === pod.name) li.classList.add('active');
        li.innerHTML = `
          <span class="k8s-pod-name">${escapeHtml(pod.name)}</span>
          <span class="k8s-phase ${phaseClass(pod.phase)}">${escapeHtml(pod.phase || '—')}</span>
          <span class="k8s-muted">${escapeHtml(pod.ready)}</span>
        `;
        li.addEventListener('click', () => selectPod(pod));
        els.podList.appendChild(li);
      }
    } catch (err) {
      els.podList.innerHTML = `<li class="empty-hint error">${escapeHtml(err.message)}</li>`;
    }
  }

  function clearPodDetail() {
    els.podDetail.classList.add('hidden');
    els.containerSelect.innerHTML = '';
    els.logsView.textContent = '';
    els.metricsView.innerHTML = '';
    clearLogStream();
    teardownExec();
  }

  function selectPod(pod) {
    workbench.pod = pod;
    els.podList.querySelectorAll('.k8s-list-item').forEach((li) => {
      li.classList.toggle('active', li.querySelector('.k8s-pod-name')?.textContent === pod.name);
    });
    els.podDetail.classList.remove('hidden');
    document.getElementById('k8s-pod-title').textContent = pod.name;
    document.getElementById('k8s-pod-meta').textContent = `${pod.phase || '—'} · 就绪 ${pod.ready} · 重启 ${pod.restartCount ?? 0}`;

    els.containerSelect.innerHTML = '';
    for (const c of pod.containers || []) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      els.containerSelect.appendChild(opt);
    }

    setWorkbenchPane(workbench.pane || 'logs');
  }

  function getSelectedContainer() {
    return els.containerSelect.value || workbench?.pod?.containers?.[0] || '';
  }

  function setWorkbenchPane(pane) {
    if (!workbench?.pod) return;
    workbench.pane = pane;
    document.querySelectorAll('.k8s-pane-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.pane === pane);
    });
    els.logsView.parentElement.classList.toggle('hidden', pane !== 'logs');
    els.execHost.parentElement.classList.toggle('hidden', pane !== 'exec');
    els.metricsView.parentElement.classList.toggle('hidden', pane !== 'metrics');

    if (pane === 'logs') refreshLogs(false);
    else if (pane === 'exec') ensureExecTerminal();
    else if (pane === 'metrics') refreshMetrics();
  }

  async function refreshLogs(follow) {
    if (!workbench?.pod) return;
    const container = getSelectedContainer();
    if (!container) {
      showToast('请选择容器', 'error');
      return;
    }
    clearLogStream();
    const tail = Number(els.tailInput?.value) || 200;
    els.logsView.textContent = '加载日志…';

    if (follow) {
      els.logsView.textContent = '';
      try {
        const { streamId } = await api.k8sLogsStreamStart(
          wbPayload({
            namespace: workbench.namespace,
            podName: workbench.pod.name,
            container,
            tailLines: tail,
          })
        );
        logStreamId = streamId;
        unsubLog.push(
          api.onK8sLogChunk(({ streamId: sid, data }) => {
            if (sid !== logStreamId) return;
            els.logsView.textContent += data;
            els.logsView.scrollTop = els.logsView.scrollHeight;
          }),
          api.onK8sLogEnd(({ streamId: sid }) => {
            if (sid === logStreamId) logStreamId = null;
          }),
          api.onK8sLogError(({ streamId: sid, error }) => {
            if (sid === logStreamId) showToast(error, 'error');
          })
        );
      } catch (err) {
        els.logsView.textContent = err.message;
      }
      return;
    }

    try {
      const { text } = await api.k8sFetchLogs(
        wbPayload({
          namespace: workbench.namespace,
          podName: workbench.pod.name,
          container,
          tailLines: tail,
        })
      );
      els.logsView.textContent = text || '(空)';
    } catch (err) {
      els.logsView.textContent = err.message;
    }
  }

  async function ensureExecTerminal() {
    if (!workbench?.pod) return;
    const container = getSelectedContainer();
    if (!container) return;

    if (execSession?.podKey === `${workbench.pod.name}:${container}`) {
      requestAnimationFrame(() => execSession.resize());
      execSession.term.focus();
      return;
    }

    teardownExec();
    els.execHost.innerHTML = '';

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'SF Mono, Menlo, Monaco, monospace',
      fontSize: appSettings.fontSize || 13,
      theme: themesApi.getXtermTheme(appSettings.themeId),
    });
    const fitAddon = createFitAddon();
    term.loadAddon(fitAddon);
    term.open(els.execHost);

    const resize = () => {
      try {
        fitAddon.fit();
        if (execSession?.execId) {
          api.k8sExecResize(execSession.execId, term.cols, term.rows);
        }
      } catch (_) {
        /* hidden */
      }
    };
    const ro = new ResizeObserver(() => {
      if (!els.execHost.parentElement.classList.contains('hidden')) resize();
    });
    ro.observe(els.execHost);

    term.onData((data) => {
      if (execSession?.execId) api.k8sExecWrite(execSession.execId, data);
    });

    term.writeln('\x1b[90m正在连接 Pod 终端…\x1b[0m');

    try {
      fitAddon.fit();
      const { execId } = await api.k8sExecStart(
        wbPayload({
          namespace: workbench.namespace,
          podName: workbench.pod.name,
          container,
          cols: term.cols,
          rows: term.rows,
        })
      );
      execSession = {
        execId,
        term,
        fitAddon,
        resize,
        ro,
        podKey: `${workbench.pod.name}:${container}`,
      };
      term.writeln('\x1b[32m已连接\x1b[0m\r\n');
      unsubExec.push(
        api.onK8sExecOutput(({ execId, data }) => {
          if (execId !== execSession?.execId) return;
          term.write(data);
        }),
        api.onK8sExecClosed(({ execId }) => {
          if (execId !== execSession?.execId) return;
          term.writeln('\r\n\x1b[33m会话已结束\x1b[0m');
        })
      );
      requestAnimationFrame(resize);
    } catch (err) {
      term.writeln(`\x1b[31m${err.message}\x1b[0m`);
    }
  }

  function renderMetricsHtml(data) {
    if (!data?.pods?.length) {
      return `<div class="monitor-error">暂无指标数据（${escapeHtml(data?.source || 'metrics-api')}）</div>`;
    }
    let html = `<p class="k8s-metrics-source">数据来源: ${escapeHtml(data.source)}</p><div class="monitor-grid">`;
    for (const p of data.pods) {
      const cpuPct = p.cpuPercent != null ? p.cpuPercent : null;
      const memPct = p.memoryPercent != null ? p.memoryPercent : null;
      html += `
        <div class="metric-card">
          <div class="metric-card-head">
            <span class="metric-label">${escapeHtml(p.name)}</span>
          </div>
          <p class="metric-detail">CPU ${formatCpu(p.cpuCores)}${p.cpuLimit ? ` / ${formatCpu(p.cpuLimit)}` : ''}</p>
          <p class="metric-detail">内存 ${formatBytes(p.memoryBytes)}${p.memoryLimit ? ` / ${formatBytes(p.memoryLimit)}` : ''}</p>
          ${cpuPct != null ? `<p class="metric-detail">CPU 使用率约 ${cpuPct.toFixed(1)}%</p>` : ''}
          ${memPct != null ? `<p class="metric-detail">内存使用率约 ${memPct.toFixed(1)}%</p>` : ''}
        </div>
      `;
    }
    html += '</div>';
    if (data.nodes?.length) {
      html += '<h3 class="monitor-section-title">节点</h3><div class="monitor-grid">';
      for (const n of data.nodes) {
        html += `
          <div class="metric-card">
            <div class="metric-card-head"><span class="metric-label">${escapeHtml(n.name)}</span></div>
            <p class="metric-detail">CPU ${formatCpu(n.cpu)} · 内存 ${formatBytes(n.memory)}</p>
          </div>
        `;
      }
      html += '</div>';
    }
    return html;
  }

  async function refreshMetrics() {
    if (!workbench?.namespace) return;
    els.metricsView.innerHTML = '<p class="empty-hint">加载指标…</p>';
    try {
      const data = await api.k8sFetchMetrics(
        wbPayload({ namespace: workbench.namespace })
      );
      els.metricsView.innerHTML = renderMetricsHtml(data);
    } catch (err) {
      els.metricsView.innerHTML = `<div class="monitor-error">${escapeHtml(err.message)}</div>`;
    }
  }

  function bindEvents() {
    document.getElementById('btn-new-k8s-cluster')?.addEventListener('click', () => openClusterDialog());
    document.getElementById('k8s-dialog-close')?.addEventListener('click', () => els.dialog.close());
    document.getElementById('k8s-cancel')?.addEventListener('click', () => els.dialog.close());
    document.getElementById('k8s-import-file')?.addEventListener('click', importKubeconfigFile);
    document.getElementById('k8s-test-dialog')?.addEventListener('click', testClusterInDialog);
    document.getElementById('k8s-btn-delete')?.addEventListener('click', async () => {
      if (!editingClusterId) return;
      clusters = clusters.filter((c) => c.id !== editingClusterId);
      await persistClusters();
      els.dialog.close();
      showToast('已删除集群', 'success');
    });
    els.form?.addEventListener('submit', saveClusterFromForm);
    els.form?.kubeconfigYaml?.addEventListener('blur', () => {
      const yaml = els.form.kubeconfigYaml.value.trim();
      if (yaml) populateContextSelect(yaml, els.contextSelect.value);
    });

    document.getElementById('k8s-wb-back')?.addEventListener('click', () => {
      showWorkbench(false);
      deps.onLeaveWorkbench?.();
    });
    document.getElementById('k8s-refresh-ns')?.addEventListener('click', loadNamespaces);
    document.getElementById('k8s-refresh-pods')?.addEventListener('click', loadPods);
    document.getElementById('k8s-logs-refresh')?.addEventListener('click', () => refreshLogs(false));
    document.getElementById('k8s-logs-follow')?.addEventListener('click', () => refreshLogs(true));
    document.getElementById('k8s-logs-stop')?.addEventListener('click', clearLogStream);
    document.getElementById('k8s-metrics-refresh')?.addEventListener('click', refreshMetrics);

    document.querySelectorAll('.k8s-pane-tab').forEach((btn) => {
      btn.addEventListener('click', () => setWorkbenchPane(btn.dataset.pane));
    });
    els.containerSelect?.addEventListener('change', () => {
      if (workbench?.pane === 'logs') refreshLogs(false);
      else if (workbench?.pane === 'exec') ensureExecTerminal();
    });
  }

  bindEvents();
  loadClusters();

  return {
    loadClusters,
    isInWorkbench: () => !!workbench,
    leaveWorkbench: () => {
      showWorkbench(false);
      deps.onLeaveWorkbench?.();
    },
    showBrowser: (visible) => {
      els.browser?.classList.toggle('hidden', !visible);
    },
  };
}

window.LocalWebSSHK8s = { createK8sModule };
