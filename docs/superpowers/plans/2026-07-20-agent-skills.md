# Agent Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add standard Agent Skills (progressive disclosure) to SSH 工具箱 Agent: advertise built-in skill metadata, load full `SKILL.md` via tools, and ship 8 ops playbooks without bypassing policy.

**Architecture:** Scan packaged `skills/*/SKILL.md` for `name`/`description`; inject metadata into the system prompt; expose `agent.load_skill` and `agent.read_skill_resource` on the existing Tool Registry. Models activate skills via tool calls; execution continues through existing SSH/SFTP/K8s tools and Policy Engine.

**Tech Stack:** Electron main CommonJS, Node `fs`/`path`, minimal YAML frontmatter parser (no new dependency), `node:test`, existing Agent Runtime / Tool Registry.

**Spec:** `docs/superpowers/specs/2026-07-20-agent-skills-design.md`

## Global Constraints

- Follow [Agent Skills](https://agentskills.io/specification): progressive disclosure (metadata → `load_skill` → optional resources).
- Built-in only under repo `skills/`; no download store, no user skill dirs, no `run_skill_script` in this plan.
- Skills must not bypass Policy Engine / confirm flow.
- Tool internal names use dots (`agent.load_skill`); OpenAI API names use underscores via existing `toApiToolName`.
- Prefer Chinese UI copy consistent with the app.
- Do not publish npm or bump version unless user asks; commit per task when executing.
- Tests: `node --test <file>`; wire new tests into `scripts/agent-check.mjs` when added.

## File Map

| Path | Responsibility |
|------|----------------|
| `skills/<name>/SKILL.md` | Built-in playbooks (8) |
| `main/agent/skills/catalog.js` | Resolve skills root; scan; parse frontmatter; list metadata |
| `main/agent/skills/loader.js` | Load Markdown body; safe-read resources under skill dir |
| `main/agent/skills/catalog.test.js` | Catalog + frontmatter tests |
| `main/agent/skills/loader.test.js` | Body load + path escape tests |
| `main/agent/tools/skills.js` | Register `agent.load_skill` / `agent.read_skill_resource` |
| `main/agent/tools/skills.test.js` | Tool execute tests |
| `main/agent/tools/index.js` | Include skill tools in default registry |
| `main/agent/runtime.js` | Advertise skills in `buildSystemPrompt` |
| `main/agent/runtime.test.js` | Assert prompt lists skills when provided |
| `src/agent-ui.js` | Friendly labels for skill tools |
| `package.json` | Include `skills/` in npm `files` and electron-builder `files` |
| `scripts/agent-check.mjs` | Run new unit tests |

---

### Task 1: Skills catalog (scan + frontmatter)

**Files:**
- Create: `main/agent/skills/catalog.js`
- Create: `main/agent/skills/catalog.test.js`
- Create (test fixture): `main/agent/skills/_fixtures/sample-skill/SKILL.md`

**Interfaces:**
- Produces:
  - `resolveSkillsRoot(appRoot?: string): string` — if `appRoot` given → `path.join(appRoot, 'skills')`; else from `__dirname` (`main/agent/skills`) use `path.join(__dirname, '..', '..', '..', 'skills')` (package root)
  - `parseFrontmatter(raw: string): { data: object, body: string }`
  - `loadCatalog(skillsRoot?: string): Array<{ name: string, description: string, dir: string, skillPath: string }>`
  - `getCatalog(skillsRoot?: string)` — same as `loadCatalog` but cached by root path; `clearCatalogCache()` for tests

- [ ] **Step 1: Write the failing test**

Create fixture `main/agent/skills/_fixtures/sample-skill/SKILL.md`:

```markdown
---
name: sample-skill
description: Sample skill for unit tests. Use when testing the skills catalog.
---

# Sample

Do the sample thing.
```

Create `main/agent/skills/catalog.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  parseFrontmatter,
  loadCatalog,
  clearCatalogCache,
  resolveSkillsRoot,
} = require('./catalog');

test('parseFrontmatter extracts name description and body', () => {
  const raw = `---\nname: foo\ndescription: Bar baz\n---\n\n# Hello\n`;
  const { data, body } = parseFrontmatter(raw);
  assert.equal(data.name, 'foo');
  assert.equal(data.description, 'Bar baz');
  assert.match(body, /# Hello/);
  assert.doesNotMatch(body, /^---/);
});

test('loadCatalog finds fixture skill', () => {
  clearCatalogCache();
  const root = path.join(__dirname, '_fixtures');
  const list = loadCatalog(root);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'sample-skill');
  assert.match(list[0].description, /Sample skill/);
  assert.ok(list[0].skillPath.endsWith('SKILL.md'));
});

test('resolveSkillsRoot defaults under package root skills/', () => {
  const root = resolveSkillsRoot();
  assert.ok(root.endsWith(`${path.sep}skills`));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/langyue/my-workspace/LocalWebSSH && node --test main/agent/skills/catalog.test.js`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement catalog.js**

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

const cache = new Map();

function resolveSkillsRoot(appRoot) {
  if (appRoot) return path.join(appRoot, 'skills');
  return path.join(__dirname, '..', '..', '..', 'skills');
}

function parseFrontmatter(raw) {
  const text = String(raw || '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: text };
  const yaml = match[1];
  const body = match[2].replace(/^\r?\n/, '');
  const data = {};
  for (const line of yaml.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[m[1]] = value;
  }
  return { data, body };
}

function loadCatalog(skillsRoot) {
  const root = skillsRoot || resolveSkillsRoot();
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith('_') || ent.name.startsWith('.')) continue;
    const skillPath = path.join(root, ent.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const raw = fs.readFileSync(skillPath, 'utf8');
    const { data } = parseFrontmatter(raw);
    const name = String(data.name || ent.name).trim();
    const description = String(data.description || '').trim();
    if (!name || !description) continue;
    if (name !== ent.name) continue;
    out.push({
      name,
      description,
      dir: path.join(root, ent.name),
      skillPath,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function getCatalog(skillsRoot) {
  const root = skillsRoot || resolveSkillsRoot();
  if (!cache.has(root)) cache.set(root, loadCatalog(root));
  return cache.get(root);
}

function clearCatalogCache() {
  cache.clear();
}

module.exports = {
  resolveSkillsRoot,
  parseFrontmatter,
  loadCatalog,
  getCatalog,
  clearCatalogCache,
};
```

Note: fixture lives under `_fixtures/`; `loadCatalog` skips dirs starting with `_` when scanning production `skills/`, but tests pass `_fixtures` as root and load its children — `_fixtures/sample-skill` is fine because the skip applies to **entries under the root**, and `sample-skill` does not start with `_`. Good.

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test main/agent/skills/catalog.test.js`

- [ ] **Step 5: Commit** (when user asked / during execution)

```bash
git add main/agent/skills/catalog.js main/agent/skills/catalog.test.js main/agent/skills/_fixtures/sample-skill/SKILL.md
git commit -m "$(cat <<'EOF'
feat(agent): add skills catalog scanner and frontmatter parser

EOF
)"
```

---

### Task 2: Skill loader (body + safe resources)

**Files:**
- Create: `main/agent/skills/loader.js`
- Create: `main/agent/skills/loader.test.js`
- Create (fixture resource): `main/agent/skills/_fixtures/sample-skill/references/notes.md`

**Interfaces:**
- Consumes: `getCatalog` / `loadCatalog` from `catalog.js`
- Produces:
  - `loadSkill(name: string, skillsRoot?: string): { name, description, content }` — `content` is Markdown **body without frontmatter**; throws or returns error object? Prefer throw `Error` with Chinese message for unknown; tools layer catches into `{ ok: false }`.
  - `readSkillResource(name: string, relPath: string, skillsRoot?: string): { name, path, content }`
  - Path rules: `relPath` must be relative; only under `references/` or `assets/`; reject `..`, absolute paths, symlink escape (resolve + `startsWith` skill dir)

- [ ] **Step 1: Write failing tests**

`references/notes.md`:

```markdown
Fixture notes for sample-skill.
```

`loader.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { clearCatalogCache } = require('./catalog');
const { loadSkill, readSkillResource } = require('./loader');

const root = path.join(__dirname, '_fixtures');

test('loadSkill returns body without frontmatter', () => {
  clearCatalogCache();
  const skill = loadSkill('sample-skill', root);
  assert.equal(skill.name, 'sample-skill');
  assert.doesNotMatch(skill.content, /^---/);
  assert.match(skill.content, /Do the sample thing/);
});

test('loadSkill unknown name throws', () => {
  clearCatalogCache();
  assert.throws(() => loadSkill('nope', root), /未找到|不存在|unknown/i);
});

test('readSkillResource reads references file', () => {
  clearCatalogCache();
  const res = readSkillResource('sample-skill', 'references/notes.md', root);
  assert.match(res.content, /Fixture notes/);
});

test('readSkillResource rejects path escape', () => {
  clearCatalogCache();
  assert.throws(() => readSkillResource('sample-skill', '../catalog.js', root));
  assert.throws(() => readSkillResource('sample-skill', 'scripts/x.sh', root));
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test main/agent/skills/loader.test.js`

- [ ] **Step 3: Implement loader.js**

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const { getCatalog, parseFrontmatter } = require('./catalog');

function findEntry(name, skillsRoot) {
  const list = getCatalog(skillsRoot);
  const entry = list.find((s) => s.name === name);
  if (!entry) {
    const names = list.map((s) => s.name).join(', ') || '(无)';
    throw new Error(`未找到 skill「${name}」。可用: ${names}`);
  }
  return entry;
}

function loadSkill(name, skillsRoot) {
  const entry = findEntry(name, skillsRoot);
  const raw = fs.readFileSync(entry.skillPath, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  return {
    name: entry.name,
    description: entry.description || String(data.description || ''),
    content: body,
  };
}

function readSkillResource(name, relPath, skillsRoot) {
  const entry = findEntry(name, skillsRoot);
  const input = String(relPath || '').replace(/\\/g, '/');
  if (!input || path.isAbsolute(input) || input.includes('\0')) {
    throw new Error('非法资源路径');
  }
  const normalized = path.normalize(input);
  if (normalized.startsWith('..') || normalized.includes(`${path.sep}..`)) {
    throw new Error('非法资源路径');
  }
  const posix = normalized.split(path.sep).join('/');
  if (!posix.startsWith('references/') && !posix.startsWith('assets/')) {
    throw new Error('仅允许读取 references/ 或 assets/ 下的文件');
  }
  const abs = path.resolve(entry.dir, normalized);
  const rootResolved = path.resolve(entry.dir) + path.sep;
  if (abs !== path.resolve(entry.dir) && !abs.startsWith(rootResolved)) {
    throw new Error('非法资源路径');
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error(`资源不存在: ${posix}`);
  }
  const real = fs.realpathSync(abs);
  const realRoot = fs.realpathSync(entry.dir) + path.sep;
  if (!real.startsWith(realRoot)) {
    throw new Error('非法资源路径');
  }
  return {
    name: entry.name,
    path: posix,
    content: fs.readFileSync(real, 'utf8'),
  };
}

module.exports = { loadSkill, readSkillResource };
```

- [ ] **Step 4: Run — expect PASS**

Run: `node --test main/agent/skills/catalog.test.js main/agent/skills/loader.test.js`

- [ ] **Step 5: Commit**

```bash
git add main/agent/skills/loader.js main/agent/skills/loader.test.js main/agent/skills/_fixtures/sample-skill/references/notes.md
git commit -m "$(cat <<'EOF'
feat(agent): add skill body and safe resource loader

EOF
)"
```

---

### Task 3: Register skill tools on Tool Registry

**Files:**
- Create: `main/agent/tools/skills.js`
- Create: `main/agent/tools/skills.test.js`
- Modify: `main/agent/tools/index.js`
- Modify: `src/agent-ui.js` (`TOOL_LABELS`)
- Modify: `scripts/agent-check.mjs` (add test paths)

**Interfaces:**
- Consumes: `loadSkill`, `readSkillResource` from `../skills/loader`
- Produces: tool modules array for registry:
  - `agent.load_skill` — `riskLevel: read`, `inputSchema: { name }`, execute → `{ ok, data }` / `{ ok: false, error }`
  - `agent.read_skill_resource` — `riskLevel: read`, `inputSchema: { name, path }`

Optional factory: `createSkillTools({ skillsRoot })` so tests inject `_fixtures`.

- [ ] **Step 1: Write failing tool tests**

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { clearCatalogCache } = require('../skills/catalog');
const { createSkillTools } = require('./skills');

const root = path.join(__dirname, '../skills/_fixtures');

test('agent.load_skill returns content', async () => {
  clearCatalogCache();
  const [loadSkillTool] = createSkillTools({ skillsRoot: root });
  const res = await loadSkillTool.execute({ name: 'sample-skill' });
  assert.equal(res.ok, true);
  assert.match(res.data.content, /sample thing/i);
});

test('agent.load_skill unknown returns ok false', async () => {
  clearCatalogCache();
  const [loadSkillTool] = createSkillTools({ skillsRoot: root });
  const res = await loadSkillTool.execute({ name: 'missing' });
  assert.equal(res.ok, false);
  assert.match(res.error, /可用/);
});

test('agent.read_skill_resource works', async () => {
  clearCatalogCache();
  const tools = createSkillTools({ skillsRoot: root });
  const readTool = tools.find((t) => t.name === 'agent.read_skill_resource');
  const res = await readTool.execute({ name: 'sample-skill', path: 'references/notes.md' });
  assert.equal(res.ok, true);
  assert.match(res.data.content, /Fixture notes/);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test main/agent/tools/skills.test.js`

- [ ] **Step 3: Implement tools/skills.js and wire index**

`main/agent/tools/skills.js`:

```javascript
'use strict';

const { RISK } = require('../types');
const { loadSkill, readSkillResource } = require('../skills/loader');

function createSkillTools(opts = {}) {
  const skillsRoot = opts.skillsRoot;

  const loadSkillTool = {
    name: 'agent.load_skill',
    description:
      '加载内置运维 Skill 的完整说明（Agent Skills 标准）。在任务匹配某个 skill 的 description 时先调用本工具，再按说明使用其他工具。',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill 名称，如 host-health-check' },
      },
      required: ['name'],
    },
    async execute(args) {
      try {
        const data = loadSkill(String(args.name || '').trim(), skillsRoot);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  const readResourceTool = {
    name: 'agent.read_skill_resource',
    description:
      '读取已加载 skill 目录下 references/ 或 assets/ 中的附属文件。',
    riskLevel: RISK.READ,
    available: true,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill 名称' },
        path: {
          type: 'string',
          description: '相对路径，必须以 references/ 或 assets/ 开头',
        },
      },
      required: ['name', 'path'],
    },
    async execute(args) {
      try {
        const data = readSkillResource(
          String(args.name || '').trim(),
          String(args.path || '').trim(),
          skillsRoot
        );
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };

  return [loadSkillTool, readResourceTool];
}

module.exports = { createSkillTools };
```

Modify `main/agent/tools/index.js` to require and spread `createSkillTools()` into `createToolRegistry([...])` (production uses default skills root).

In `src/agent-ui.js` `TOOL_LABELS` add:

```javascript
  agent_load_skill: '加载技能',
  'agent.load_skill': '加载技能',
  agent_read_skill_resource: '读取技能资料',
  'agent.read_skill_resource': '读取技能资料',
```

In `scripts/agent-check.mjs`, add the three new test files to the relevant layer list (or a new skills section) and to any “all tests” arrays used by the latest check level.

- [ ] **Step 4: Run — expect PASS**

Run:

```bash
node --test main/agent/tools/skills.test.js
node -e "const { createDefaultRegistry } = require('./main/agent/tools'); const r = createDefaultRegistry(); console.log(!!r.get('agent.load_skill'), !!r.get('agent.read_skill_resource'));"
```

Expected: tests PASS; prints `true true`

- [ ] **Step 5: Commit**

```bash
git add main/agent/tools/skills.js main/agent/tools/skills.test.js main/agent/tools/index.js src/agent-ui.js scripts/agent-check.mjs
git commit -m "$(cat <<'EOF'
feat(agent): register load_skill and read_skill_resource tools

EOF
)"
```

---

### Task 4: Advertise skills in system prompt

**Files:**
- Modify: `main/agent/runtime.js` (`buildSystemPrompt`)
- Modify: `main/agent/runtime.test.js`

**Interfaces:**
- Change `buildSystemPrompt(tools, skills?)` where `skills` is `Array<{ name, description }>` (default `getCatalog()` inside runtime if omitted).
- Prompt must include a section:

```text
可用 Skills（任务匹配时先调用 agent_load_skill 加载完整说明，再执行）：
- host-health-check: ...
```

If catalog empty, omit the Skills section (or print「暂无」— prefer omit).

- [ ] **Step 1: Extend runtime.test.js**

Add:

```javascript
test('buildSystemPrompt advertises skills', () => {
  const prompt = buildSystemPrompt(
    [{ name: 'metrics.fetch', description: '指标' }],
    [{ name: 'host-health-check', description: '主机体检。Use when user asks for health check.' }]
  );
  assert.match(prompt, /可用 Skills/);
  assert.match(prompt, /host-health-check/);
  assert.match(prompt, /agent_load_skill/);
  assert.match(prompt, /metrics_fetch/);
});
```

Update existing `buildSystemPrompt` call sites in the same file if arity changes (pass `[]` or rely on default).

- [ ] **Step 2: Run — expect FAIL** on new assertion

Run: `node --test main/agent/runtime.test.js`

- [ ] **Step 3: Update buildSystemPrompt**

```javascript
function buildSystemPrompt(tools, skills) {
  const { toApiToolName } = require('./tools/registry');
  const { getCatalog } = require('./skills/catalog');
  const skillList = Array.isArray(skills) ? skills : getCatalog();
  const names = tools
    .map((t) => `- ${toApiToolName(t.name)}: ${t.description}`)
    .join('\n');
  const parts = [
    '你是 SSH 工具箱助手，帮助用户管理 SSH 连接、远程命令与服务器运维。',
    '请用简洁清晰的中文回答。',
    '',
    '规则：',
    '1. 只能使用下列已注册且可用的工具，禁止臆造执行结果。',
    '2. 未绑定服务器时，先请用户选择目标或调用 server_list / agent_ask_user。',
    '3. 只读命令可直接执行；写/高危命令需用户确认后执行。',
    '4. 若用户任务匹配某个 Skill 的说明，先调用 agent_load_skill 加载完整步骤，再按步骤执行。',
    '',
    '可用工具：',
    names,
  ];
  if (skillList.length) {
    parts.push(
      '',
      '可用 Skills（任务匹配时先调用 agent_load_skill 加载完整说明，再执行）：',
      ...skillList.map((s) => `- ${s.name}: ${s.description}`)
    );
  }
  return parts.join('\n');
}
```

Keep `module.exports` exporting `buildSystemPrompt`.

- [ ] **Step 4: Run — expect PASS**

Run: `node --test main/agent/runtime.test.js`

- [ ] **Step 5: Commit**

```bash
git add main/agent/runtime.js main/agent/runtime.test.js
git commit -m "$(cat <<'EOF'
feat(agent): advertise built-in skills in system prompt

EOF
)"
```

---

### Task 5: Author 8 built-in SKILL.md playbooks

**Files:**
- Create: `skills/host-health-check/SKILL.md`
- Create: `skills/disk-space-triage/SKILL.md`
- Create: `skills/log-investigation/SKILL.md`
- Create: `skills/service-status-check/SKILL.md`
- Create: `skills/safe-service-restart/SKILL.md`
- Create: `skills/config-change-checklist/SKILL.md`
- Create: `skills/k8s-pod-troubleshoot/SKILL.md`
- Create: `skills/k8s-workload-restart/SKILL.md`
- Create: `main/agent/skills/builtin.test.js` (asserts catalog length === 8 and required names)

Each file: YAML `name` (must match directory) + `description` (WHAT + WHEN, Chinese triggers + English keywords) + concise steps. Prefer tools: `server.list`, `metrics.fetch`, `ssh.exec`, `ssh.tail_log`, `sftp.*`, `k8s.*`, `agent.ask_user`. State that write/danger waits for user confirm. Do not invent command output.

Example skeleton for `host-health-check`:

```markdown
---
name: host-health-check
description: 对已绑定 SSH 主机做健康体检（负载、内存、磁盘、关键进程）。在用户提到体检、健康检查、机器状态、host health、health check 时使用。
---

# 主机体检

## 何时使用
用户要了解主机是否健康、资源是否紧张。

## 步骤
1. 若未绑定 SSH 目标：`server_list` 或 `agent_ask_user`。
2. 调用 `metrics_fetch` 获取 CPU/内存/磁盘（及 GPU 如有）。
3. 必要时用只读 `ssh_exec`：`uptime`、`free -h`、`df -h`、`ps aux --sort=-%cpu | head`。
4. 用中文汇总异常项与建议；不要臆造未执行命令的结果。
```

Write similarly for the other seven (disk triage, logs, service status, safe restart, config checklist, k8s pod troubleshoot, k8s workload restart). Restart/config/k8s write skills must explicitly say: propose command → wait for confirmation → verify.

- [ ] **Step 1: Write builtin.test.js (fails until files exist)**

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clearCatalogCache, loadCatalog, resolveSkillsRoot } = require('./catalog');

const REQUIRED = [
  'host-health-check',
  'disk-space-triage',
  'log-investigation',
  'service-status-check',
  'safe-service-restart',
  'config-change-checklist',
  'k8s-pod-troubleshoot',
  'k8s-workload-restart',
];

test('builtin skills catalog has 8 required skills', () => {
  clearCatalogCache();
  const list = loadCatalog(resolveSkillsRoot());
  assert.equal(list.length, 8);
  const names = new Set(list.map((s) => s.name));
  for (const n of REQUIRED) assert.ok(names.has(n), `missing ${n}`);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test main/agent/skills/builtin.test.js`

- [ ] **Step 3: Author all 8 SKILL.md files** under `skills/`

- [ ] **Step 4: Run — expect PASS**

```bash
node --test main/agent/skills/builtin.test.js
node --test main/agent/skills/catalog.test.js main/agent/skills/loader.test.js
```

- [ ] **Step 5: Commit**

```bash
git add skills/ main/agent/skills/builtin.test.js
git commit -m "$(cat <<'EOF'
feat(agent): add eight built-in ops Agent Skills playbooks

EOF
)"
```

---

### Task 6: Packaging + check harness + smoke

**Files:**
- Modify: `package.json` — add `"skills/"` to `files`; add `"skills/**/*"` to `build.files`
- Modify: `scripts/agent-check.mjs` — include:
  - `main/agent/skills/catalog.test.js`
  - `main/agent/skills/loader.test.js`
  - `main/agent/skills/builtin.test.js`
  - `main/agent/tools/skills.test.js`
- Optionally assert in check script that `skills/` exists and has 8 dirs (lightweight)

- [ ] **Step 1: Update package.json files arrays**

`files` becomes:

```json
"files": [
  "bin/",
  "main/",
  "src/",
  "skills/",
  "docs/",
  "LICENSE",
  "README.md"
]
```

Under `build.files` add `"skills/**/*"` alongside existing `main/**/*`, `src/**/*`.

- [ ] **Step 2: Update agent-check.mjs** to run the new tests in the final / all-tests path.

- [ ] **Step 3: Run full agent check**

Run: `node scripts/agent-check.mjs` (or the project’s documented check entry that includes agent tests)

Expected: all listed tests PASS; project check still OK.

- [ ] **Step 4: Manual smoke (document in commit message / progress)**

1. `npm start`
2. Open Agent，问「帮我体检一下这台机器」（已绑服务器）→ 应出现加载 `host-health-check` 再调工具
3. 闲聊「你好」→ 可不加载 skill
4. 触发重启类请求 → 写操作仍确认

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/agent-check.mjs
git commit -m "$(cat <<'EOF'
chore: package built-in skills and wire agent-check

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Progressive disclosure / advertise metadata | Task 4 |
| `agent.load_skill` / `agent.read_skill_resource` | Task 3 |
| Catalog scan + frontmatter | Task 1 |
| Safe resource paths | Task 2 |
| 8 built-in skills | Task 5 |
| Package `skills/` | Task 6 |
| UI labels (minimal) | Task 3 |
| No bypass policy / no store / no scripts | Global + skill copy in Task 5 |
| Acceptance scenarios | Task 6 manual smoke |

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-07-20-agent-skills.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
