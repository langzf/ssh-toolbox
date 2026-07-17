# Agent Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete in-app Agent session to SSH 工具箱 so users can operate SSH hosts and K8s clusters via chat (OpenAI-compatible LLM + tool calling), with policy confirmation; remote channels deferred to phase 2.

**Architecture:** Electron main-process Agent Runtime owns LLM calls, tool registry, policy engine, and session store. Renderer provides sidebar Agent UI and per-SSH-session Agent pane. Tools wrap existing `sessions` / SFTP / metrics / `main/k8s.js`. Phase-2 Channel Adapter interface is stubbed only.

**Tech Stack:** Electron, CommonJS main process, `fetch` to OpenAI-compatible APIs, `electron-store` + `safeStorage`, existing `ssh2` / `@kubernetes/client-node`, Node built-in `node:test` for unit checks.

**Spec:** `docs/superpowers/specs/2026-07-17-agent-session-design.md`

## Global Constraints

- macOS Electron app; main code under `main/`, UI under `src/`.
- LLM: OpenAI-compatible `POST {baseUrl}/v1/chat/completions` with `tools` / `tool_calls`; settings = Base URL + API Key + Model.
- API Key encrypted via existing `safeStorage` helpers; never store plaintext key in `agent-sessions`.
- Default policy mode: `standard` (read auto; write/danger confirm). Modes: `strict` | `standard` | `relaxed`.
- Layer rule: finish Task N check + manual verify before starting next layer.
- Phase 2 (Feishu/WeChat/voice): stub `ChannelAdapter` only; do not implement adapters.
- Do not publish npm or bump marketing version unless user asks; keep commits focused per task.
- Prefer Chinese UI copy consistent with existing app.

## File Map

| Path | Responsibility |
|------|----------------|
| `main/agent/types.js` | Shared constants / risk levels / defaults |
| `main/agent/llm-client.js` | OpenAI-compatible chat + tools request |
| `main/agent/policy.js` | Policy mode + `ssh.exec` risk classifier |
| `main/agent/sessions.js` | Persist agent sessions / messages |
| `main/agent/settings.js` | Agent settings + encrypted API key get/set |
| `main/agent/tools/registry.js` | Register tools; expose OpenAI tool schemas |
| `main/agent/tools/*.js` | Individual tools (server, ssh, sftp, metrics, k8s, meta) |
| `main/agent/runtime.js` | Orchestration loop + confirm handshake |
| `main/agent/channel-adapter.js` | Phase-2 stub interface |
| `main/agent/ipc.js` | `registerAgentIpc(ipcMain, deps)` |
| `main/main.js` | Wire agent IPC + deps |
| `main/preload.js` | Expose `localWebSSH.agent*` APIs |
| `src/agent-ui.js` | Sidebar Agent browser + chat workbench |
| `src/index.html` / `src/styles.css` / `src/renderer.js` | Nav, settings fields, session Agent pane |
| `scripts/agent-check.mjs` | Layer smoke checks (unit + file presence) |
| `main/agent/*.test.js` | `node:test` unit tests |

---

### Task 1: L1 — Agent settings, LLM client, chat without tools

**Files:**
- Create: `main/agent/types.js`
- Create: `main/agent/settings.js`
- Create: `main/agent/llm-client.js`
- Create: `main/agent/llm-client.test.js`
- Create: `main/agent/ipc.js` (settings + `agent-chat-simple` only)
- Create: `scripts/agent-check.mjs`
- Modify: `main/main.js` — register agent IPC; pass `encryptSecret` / `decryptSecret`
- Modify: `main/preload.js` — agent settings + simple chat APIs
- Modify: `src/index.html` — Agent section in settings dialog
- Modify: `src/renderer.js` — load/save agent settings fields
- Modify: `src/styles.css` — minimal settings spacing if needed

**Interfaces:**
- Consumes: `encryptSecret(text)`, `decryptSecret(encoded)` from `main.js`
- Produces:
  - `getAgentSettings()` → `{ baseUrl, model, policyMode, maxSteps, timeoutMs, hasApiKey }`
  - `saveAgentSettings({ baseUrl, model, policyMode, maxSteps, timeoutMs, apiKey? })`
  - `chatCompletion({ messages, tools? })` → OpenAI-shaped response message
  - IPC: `agent-settings-get`, `agent-settings-save`, `agent-chat` (no tools yet)

- [ ] **Step 1: Add types and settings module**

Create `main/agent/types.js`:

```js
const RISK = { READ: 'read', WRITE: 'write', DANGER: 'danger' };
const POLICY = { STRICT: 'strict', STANDARD: 'standard', RELAXED: 'relaxed' };
const DEFAULT_AGENT_SETTINGS = {
  baseUrl: 'https://api.openai.com',
  model: 'gpt-4o-mini',
  policyMode: POLICY.STANDARD,
  maxSteps: 12,
  timeoutMs: 60000,
};
module.exports = { RISK, POLICY, DEFAULT_AGENT_SETTINGS };
```

Create `main/agent/settings.js` using `electron-store` name `agent-settings` and credential key `agentApiKey` via injected encrypt/decrypt (same pattern as SSH credentials). Expose `getPublicSettings()`, `saveSettings(partial)`, `getApiKey()`, `setApiKey(key)`.

- [ ] **Step 2: Write failing LLM client test**

Create `main/agent/llm-client.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBaseUrl, buildChatUrl } = require('./llm-client');

test('normalizeBaseUrl strips trailing slash and /v1', () => {
  assert.equal(normalizeBaseUrl('https://x.com/v1/'), 'https://x.com');
});

test('buildChatUrl appends /v1/chat/completions', () => {
  assert.equal(buildChatUrl('https://x.com'), 'https://x.com/v1/chat/completions');
});
```

- [ ] **Step 3: Run test — expect FAIL (module missing exports)**

Run: `cd /Users/langyue/my-workspace/LocalWebSSH && node --test main/agent/llm-client.test.js`  
Expected: FAIL (cannot find module or missing exports)

- [ ] **Step 4: Implement llm-client.js**

```js
function normalizeBaseUrl(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (u.endsWith('/v1')) u = u.slice(0, -3);
  return u;
}
function buildChatUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/v1/chat/completions`;
}
async function chatCompletion({ baseUrl, apiKey, model, messages, tools, timeoutMs }) {
  if (!apiKey) throw new Error('请先在设置中配置 Agent API Key');
  if (!normalizeBaseUrl(baseUrl)) throw new Error('请配置 Agent Base URL');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 60000);
  try {
    const body = { model, messages };
    if (tools?.length) body.tools = tools;
    const res = await fetch(buildChatUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json.error?.message || json.message || `LLM 请求失败 (${res.status})`;
      throw new Error(msg);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}
module.exports = { normalizeBaseUrl, buildChatUrl, chatCompletion };
```

- [ ] **Step 5: Re-run unit test — expect PASS**

Run: `node --test main/agent/llm-client.test.js`  
Expected: PASS

- [ ] **Step 6: Wire IPC + settings UI + simple agent-chat**

In `main/agent/ipc.js`, register:
- `agent-settings-get` / `agent-settings-save`
- `agent-chat` → single-turn `chatCompletion` with system prompt “你是 SSH 工具箱助手…” and **no tools**

In settings dialog (`src/index.html`), add fields: `agentBaseUrl`, `agentApiKey` (password), `agentModel`, `agentPolicyMode` select, `agentMaxSteps`, `agentTimeoutMs`. Persist via preload APIs from renderer settings submit handler (merge with existing settings save or separate save on same form).

Preload expose:
```js
agentGetSettings: () => ipcRenderer.invoke('agent-settings-get'),
agentSaveSettings: (s) => ipcRenderer.invoke('agent-settings-save', s),
agentChat: (payload) => ipcRenderer.invoke('agent-chat', payload),
```

Temporary smoke path: until Task 2 UI exists, add a small “测试 Agent 连接” button in settings that calls `agentChat({ messages: [{ role:'user', content:'回复：pong' }] })` and `showToast` result/error.

- [ ] **Step 7: Layer check script**

`scripts/agent-check.mjs` L1: assert files exist; run `node --test main/agent/llm-client.test.js`.

Run: `node scripts/agent-check.mjs --layer=1`  
Expected: `L1 OK`

- [ ] **Step 8: Manual verify L1**

1. `npm start`
2. 设置填入中转 URL / Key / Model → 保存
3. 点「测试 Agent 连接」→ 收到模型回复
4. 清空 Key → 应提示友好中文错误

- [ ] **Step 9: Commit**

```bash
git add main/agent main/main.js main/preload.js src/index.html src/renderer.js src/styles.css scripts/agent-check.mjs
git commit -m "feat(agent): L1 settings and OpenAI-compatible chat without tools"
```

---

### Task 2: L2 — Sidebar Agent UI + session persistence

**Files:**
- Create: `main/agent/sessions.js`
- Create: `main/agent/sessions.test.js`
- Create: `src/agent-ui.js`
- Modify: `main/agent/ipc.js` — session CRUD + send message (still no tools / or stub)
- Modify: `main/preload.js`
- Modify: `src/index.html` — nav item Agent, `#agent-browser`, `#agent-workbench`
- Modify: `src/renderer.js` — workspaceMode `agent` / `agent-workbench`, bootCheck for `LocalWebSSHAgent`
- Modify: `src/styles.css` — chat layout
- Modify: `scripts/agent-check.mjs` — L2 checks

**Interfaces:**
- Consumes: `agent-chat` from Task 1
- Produces:
  - `listSessions()` / `createSession({ title? })` / `getSession(id)` / `appendMessage(id, msg)` / `deleteSession(id)`
  - Message shape: `{ id, role: 'user'|'assistant'|'system'|'tool', content, toolCalls?, createdAt }`
  - UI: `window.LocalWebSSHAgent.createAgentModule({ api, showToast, uid, ... })`

- [ ] **Step 1: Session store + test**

`sessions.js` with electron-store `agent-sessions`. Cap stored tool/output content at e.g. 20_000 chars with `truncated: true` flag.

Test: create → append → list → delete.

- [ ] **Step 2: Run `node --test main/agent/sessions.test.js` — FAIL then implement — PASS**

- [ ] **Step 3: agent-ui.js workbench**

Sidebar nav `data-view="agent"` with badge count. Browser lists sessions; workbench shows message list + textarea + send. Send flow: append user message → `agentChat` with history → append assistant → persist via IPC.

- [ ] **Step 4: Integrate visibility like K8s** (`workspaceMode === 'agent' | 'agent-workbench'`)

- [ ] **Step 5: `node scripts/agent-check.mjs --layer=2`**

Expected: `L2 OK`

- [ ] **Step 6: Manual verify**

新建会话 → 多轮闲聊 → 退出重开 → 历史仍在；删除会话生效。

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(agent): L2 sidebar chat UI and session persistence"
```

---

### Task 3: L3 — Tool registry + SSH read-only tools + runtime loop

**Files:**
- Create: `main/agent/tools/registry.js`
- Create: `main/agent/tools/meta.js` — `agent.ask_user`
- Create: `main/agent/tools/server.js` — `server.list`
- Create: `main/agent/tools/ssh-read.js` — `ssh.exec` (read-only path only for now), `ssh.tail_log`
- Create: `main/agent/tools/metrics-tool.js` — `metrics.fetch`
- Create: `main/agent/tools/sftp-read.js` — `sftp.list`, `sftp.read`
- Create: `main/agent/runtime.js`
- Create: `main/agent/policy.js` (classifier used to **block** write/danger in L3 by returning error “需升级到写操作层” OR mark tools unavailable — prefer classifier + refuse write)
- Create: `main/agent/runtime.test.js` — mock LLM returning one tool call then final text
- Modify: `main/agent/ipc.js` — `agent-send` uses runtime
- Modify: `main/agent/tools` registration to set write tools `available: false` until L5
- Modify: `src/agent-ui.js` — render tool call cards; target binder (pick server)
- Modify: `scripts/agent-check.mjs`

**Interfaces:**
- Tool object:
  ```js
  {
    name: 'metrics.fetch',
    description: '...',
    riskLevel: 'read', // or 'dynamic' for ssh.exec
    available: true,
    inputSchema: { type:'object', properties:{...}, required:[...] },
    execute: async (args, ctx) => ({ ok: true, data })
  }
  ```
- `ctx`: `{ sessions, getConnections, agentSession, ensureSshSession, requestConfirm }`
- `runAgentTurn({ agentSessionId, userText })` → `{ messages, pendingConfirm? }`

- [ ] **Step 1: Implement registry + policy classifyCommand(cmd) with unit tests**

Examples:
- `df -h` → `read`
- `systemctl restart nginx` → `write`
- `rm -rf /` → `danger`

- [ ] **Step 2: Implement read tools wrapping existing helpers**

Reuse `execOnSession` from `metrics.js` (export it) for `ssh.exec` / `ssh.tail_log`. For `sftp.list`/`read`, open SFTP on session like `main/sftp.js`.

`server.list` reads connections store via injected `listConnections`.

`server.connect` in L3: allow creating/reusing SSH session (risk write — under **standard** needs confirm; for L3 either auto-allow connect only or treat connect as special `write` that L3 confirm stub auto-approves for connect tool only). **Decision locked:** L3 enables `server.connect` with confirm callback that L3 UI auto-implements later in L4; for L3 manual test use policyMode `relaxed` **or** implement minimal confirm IPC that auto-resolves `allow` only for `server.connect`. Prefer: L3 `requestConfirm` resolves `allow` for `server.connect` only; other write/danger rejected.

- [ ] **Step 3: Runtime loop**

```js
async function runAgentTurn(deps, { agentSessionId, userText }) {
  // append user, loop up to maxSteps:
  // chatCompletion with tools from registry.listAvailable()
  // if tool_calls: for each → policy → execute or pendingConfirm return
  // append tool results; continue
  // else append assistant text; return
}
```

System prompt: list available tools; must not invent results; ask_user when server unbound.

- [ ] **Step 4: UI target chip** — select saved server; store on session `targets: [{ type:'ssh', serverId }]`

- [ ] **Step 5: Tests + `agent-check --layer=3`**

- [ ] **Step 6: Manual verify**

绑定一台机 → “看看磁盘和内存” → 应调用 metrics / df；工具卡片可见。

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(agent): L3 runtime and SSH read-only tools"
```

---

### Task 4: L4 — Policy engine UI confirmation flow

**Files:**
- Modify: `main/agent/policy.js` — `decide(risk, policyMode, sessionAllowSet)`
- Modify: `main/agent/runtime.js` — emit pending confirm; resume after decision
- Modify: `main/agent/ipc.js` — `agent-confirm-response`
- Modify: `main/preload.js` — confirm APIs + event `agent-confirm-request`
- Modify: `src/agent-ui.js` — confirm modal/inline card: 允许一次 / 允许本会话同类 / 拒绝
- Create: `main/agent/policy.test.js`
- Modify: `scripts/agent-check.mjs`

**Interfaces:**
- Pending payload: `{ confirmId, agentSessionId, toolName, riskLevel, args, reason }`
- Response: `{ confirmId, decision: 'allow-once'|'allow-session'|'deny' }`
- Timeout: 120s → deny

- [ ] **Step 1: Unit tests for decide()**

| mode | risk | expected |
|------|------|----------|
| standard | read | auto |
| standard | write | confirm |
| strict | danger | deny (or confirm — **use deny for danger in strict**) |
| relaxed | write | auto |
| relaxed | danger | confirm |

- [ ] **Step 2: Implement confirm handshake end-to-end**

Runtime pauses; main sends `agent-confirm-request`; renderer responds via invoke; runtime continues.

- [ ] **Step 3: Manual verify**

策略标准下让模型调用需确认工具（可用临时 test tool `agent.debug_write` risk write available only when `process.env.AGENT_DEBUG=1`, or force by asking reconnect). Confirm deny → tool result explains 用户拒绝; allow → proceeds.

- [ ] **Step 4: `agent-check --layer=4` + commit**

```bash
git commit -m "feat(agent): L4 policy confirmation flow"
```

---

### Task 5: L5 — SSH write tools + SFTP write/delete

**Files:**
- Create: `main/agent/tools/ssh-write.js` — mark `ssh.exec` full dynamic risk
- Create: `main/agent/tools/sftp-write.js` — `sftp.write`, `sftp.upload`, `sftp.delete`
- Modify: registry — set these `available: true`
- Modify: policy classifier edge cases for delete paths
- Modify: `scripts/agent-check.mjs`
- Test: policy + sftp delete risk (`/` or `$HOME` broad deletes → danger)

- [ ] **Step 1: Enable full `ssh.exec` with dynamic risk through confirm**

- [ ] **Step 2: SFTP write/upload/delete via existing sftp session helpers**

- [ ] **Step 3: Manual verify on a disposable path** — create file via agent, delete with confirm

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(agent): L5 SSH write and SFTP mutation tools"
```

---

### Task 6: L6 — Per-SSH-session Agent pane

**Files:**
- Modify: `src/index.html` — toolbar segment `Agent`
- Modify: `src/renderer.js` — `setSessionPane(..., 'agent')`; create agent panel bound to `savedId` / `sessionId`
- Modify: `src/agent-ui.js` — `createSessionAgentPanel(sshSession, api, ...)`
- Modify: `src/styles.css`
- Modify: `scripts/agent-check.mjs`

**Interfaces:**
- Opening pane creates or reuses agent session with `targets: [{ type:'ssh', serverId, sshSessionId }]`
- Button “在侧栏打开” switches to sidebar workbench same `agentSessionId`

- [ ] **Step 1: Implement pane + binding**

- [ ] **Step 2: Manual verify** — connect SSH → Agent 页提问不需再选服务器；侧栏可看到同一会话

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(agent): L6 in-session Agent pane with auto binding"
```

---

### Task 7: L7 — K8s read-only tools

**Files:**
- Create: `main/agent/tools/k8s-read.js` — list clusters/ns/pods, pod_logs, metrics
- Modify: `main/k8s.js` — export pure functions used by tools (or call via thin wrappers already in module)
- Modify: registry + agent-ui target binder for K8s cluster/namespace
- Modify: `scripts/agent-check.mjs`
- Create: `main/agent/tools/k8s-read.test.js` — mock list mapping if needed

- [ ] **Step 1: Wire tools to existing k8s IPC logic (prefer direct function calls inside main, not IPC-to-self)**

Export from `k8s.js`: `listClusters`, `listNamespaces`, `listPods`, `readPodLogs`, `fetchPodMetrics` (already internal — export them).

- [ ] **Step 2: UI allow binding cluster target**

- [ ] **Step 3: Manual verify** on imported cluster — “列出 default 命名空间的 pod” / “看某 pod 日志”

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(agent): L7 Kubernetes read-only tools"
```

---

### Task 8: L8 — K8s write tools + Channel Adapter stub + docs

**Files:**
- Create: `main/agent/tools/k8s-write.js` — `k8s.pod_exec`; optional `k8s.apply` / `k8s.delete` if feasible via client-node
- Create: `main/agent/channel-adapter.js` — stub interface + no-op default adapter
- Modify: `docs/superpowers/specs/2026-07-17-agent-session-design.md` status → 实现中/已完成分层
- Modify: `README.md` — brief Agent feature + settings note
- Modify: `scripts/agent-check.mjs` — `--layer=8` full
- Modify: registry availability

**Interfaces (channel stub):**

```js
/**
 * @typedef {object} ChannelAdapter
 * @property {(user, text) => Promise<void>} onMessage
 * @property {(req) => Promise<'allow-once'|'allow-session'|'deny'>} requestConfirm
 * @property {(user, payload) => Promise<void>} reply
 */
function createNoopChannelAdapter() {
  return {
    async onMessage() { throw new Error('远程通道未启用（二期）'); },
    async requestConfirm() { return 'deny'; },
    async reply() {},
  };
}
module.exports = { createNoopChannelAdapter };
```

Runtime accepts optional `channelAdapter` for future; desktop UI uses local confirm path.

- [ ] **Step 1: k8s.pod_exec tool (write + confirm)** — non-interactive command capture (exec with command array, collect stdout); not full TTY chat unless straightforward

- [ ] **Step 2: Optional k8s.apply/delete** — if too heavy, implement delete namespaced pod only as danger; document apply as follow-up. **Locked minimum for L8:** `k8s.pod_exec` required; `k8s.delete_pod` danger required; `k8s.apply` optional stretch.

- [ ] **Step 3: Stub channel-adapter + mention in README**

- [ ] **Step 4: Full `node scripts/agent-check.mjs --layer=8` + manual L8 verify**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): L8 K8s write tools and phase-2 channel adapter stub"
```

---

## Manual Acceptance Matrix (from spec §9)

| # | Criterion | Task |
|---|-----------|------|
| 1 | Configure URL+Key+Model and chat | T1–T2 |
| 2 | Bind server; logs/metrics via NL | T3 |
| 3 | Write/danger confirm | T4–T5 |
| 4 | SSH session Agent pane inherits host | T6 |
| 5 | K8s browse/logs/metrics + confirmed exec | T7–T8 |
| 6 | Channel adapter stub present | T8 |

---

## Plan Self-Review

1. **Spec coverage:** L1–L8, tools, policy modes, UI dual entry, storage, phase-2 stub — mapped to Tasks 1–8. Stretch `k8s.apply` marked optional; `k8s.delete_pod` required minimum.
2. **Placeholders:** None intentional; L3 connect-confirm behavior explicitly locked.
3. **Type consistency:** `agentSessionId`, risk levels `read|write|danger`, policy `strict|standard|relaxed`, confirm decisions `allow-once|allow-session|deny` used consistently.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-07-17-agent-session.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — same session, executing-plans with checkpoints  

Which approach?
