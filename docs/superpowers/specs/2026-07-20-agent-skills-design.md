# Agent Skills 设计规格

**日期：** 2026-07-20  
**产品：** SSH 工具箱（ssh-toolbox）  
**状态：** 设计已确认，待实现  
**依据：** [Agent Skills 开放规范](https://agentskills.io/specification)

## 1. 目标与范围

### 1.1 目标

为现有本机 Agent Runtime 增加 **标准 Agent Skills** 能力：用精品运维剧本增强 SSH / 日志 / 变更 / K8s 场景下的任务执行质量，而不引入新的危险执行面。

### 1.2 一期范围（已确认）

| 项 | 决策 |
|----|------|
| 来源 | **仅内置**精品包（方案 A），随应用打包 |
| 使用流程 | **标准渐进披露**：广告元数据 → 模型调用 `load_skill` → 按正文调现有工具 |
| 场景包 | 主机 + 日志 + 变更 + K8s，约 **8** 个 skill |
| 匹配方式 | **由模型根据 description 自行决定**是否 `load_skill`（非关键词硬注入） |

### 1.3 非目标（一期不做）

- 技能商店、远程下载/更新
- 用户自定义 skills 目录
- `run_skill_script`（本地或远程脚本宏）
- 手动点选技能面板 / 设置页开关
- 绕过 Policy Engine 的「skill 特权」
- 子 Agent / 多 Agent 编排（不对标 Hermes / Claude Code）

## 2. 架构

```
skills/                              # 仓库根目录，随包分发
  <skill-name>/
    SKILL.md                         # 必选：frontmatter + 正文
    references/                      # 可选
    assets/                          # 可选

main/agent/skills/
  catalog.js                         # 扫描 skills/，解析 name + description
  loader.js                          # 加载 SKILL.md 正文；安全读取附属资源

main/agent/tools/skills.js           # agent.load_skill、agent.read_skill_resource
main/agent/runtime.js                # system 广告 skills 元数据；工具进 Registry
```

### 2.1 渐进披露（标准流程）

1. **Discovery**：每次 Agent 回合构建 system prompt 时，注入所有内置 skill 的 `name` + `description`（约数十～百 token/个），**不**注入正文。
2. **Activation**：模型判断任务相关时调用 `agent.load_skill`，Runtime 返回该 skill 的 Markdown 正文。
3. **Execution**：模型按 skill 步骤调用既有 SSH / SFTP / Metrics / K8s / `agent.ask_user` 工具。
4. **Resources（按需）**：正文引用附属文件时，通过 `agent.read_skill_resource` 读取；禁止读出 skill 目录以外的路径。

写 / 高危操作仍经现有 **Policy Engine + 确认流**；skill 只提供流程与建议命令模式，不能自动批准。

### 2.2 路径解析

- 开发：`<repoRoot>/skills`
- 打包 / npm 安装：相对应用根（Electron `app.getAppPath()` 或等价包根）下的 `skills/`
- `package.json` 的 `files` 与 electron-builder `files` **必须包含** `skills/**`

## 3. Skill 文件格式

遵循 Agent Skills 规范：

```text
skills/<skill-name>/SKILL.md
```

Frontmatter 必填：

| 字段 | 约束 |
|------|------|
| `name` | 小写字母、数字、连字符；与目录名一致；≤64 字符 |
| `description` | 非空；≤1024 字符；第三人称；含 **WHAT** 与 **WHEN**（触发场景） |

正文：简洁步骤、推荐工具顺序、边界情况、禁止臆造结果；建议主文件保持精炼（宜 &lt; 500 行）。详细表可放到 `references/`。

可选 frontmatter（一期可忽略解析，保留兼容）：`license`、`compatibility`、`metadata`、`allowed-tools`。

## 4. 首批内置 Skill（8）

| name | 场景 |
|------|------|
| `host-health-check` | 主机体检：负载、内存、磁盘、关键进程 |
| `disk-space-triage` | 磁盘告警：大目录、日志膨胀、清理建议（删除需确认） |
| `log-investigation` | 日志排查：定位路径、关键词/时间、常见报错 |
| `service-status-check` | 服务状态：systemd/进程、端口、近期日志 |
| `safe-service-restart` | 重启前检查 → 确认 → 重启 → 验证 |
| `config-change-checklist` | 改配置前备份/校验/回滚提示（写操作需确认） |
| `k8s-pod-troubleshoot` | Pod 异常：状态、事件、日志、资源 |
| `k8s-workload-restart` | 工作负载安全重启步骤（需确认） |

编写要求：

- `description` 含中文运维触发词（体检、磁盘满、查日志、重启、Pod 等）与英文常见词，便于模型匹配。
- 步骤中写明：未绑定目标时先 `agent.ask_user` / `server.list` / `k8s.list_clusters`。
- 优先只读工具；写操作步骤明确「等待用户确认后再执行」。
- 推荐使用已注册工具名（API 名与 Registry 一致，如 `ssh_exec` / 内部 `ssh.exec` 的既有映射规则）。

## 5. 工具契约

### 5.1 `agent.load_skill`

| 项 | 值 |
|----|-----|
| 风险 | `read` |
| 入参 | `{ name: string }` |
| 成功 | `{ name, description, content }`；`content` 为 **去掉 YAML frontmatter 后的 Markdown 正文**（元数据已在 `name`/`description` 字段给出） |
| 失败 | 未知 name：错误信息 + 可用 skill 名称列表 |
| 截断 | 与现有工具输出相同的长度保护 |

### 5.2 `agent.read_skill_resource`

| 项 | 值 |
|----|-----|
| 风险 | `read` |
| 入参 | `{ name: string, path: string }`（相对该 skill 目录的相对路径） |
| 约束 | 仅允许 `references/`、`assets/` 下文件；拒绝 `..`、绝对路径、符号链接逃逸 |
| 失败 | 文件不存在或路径非法时返回明确错误 |

一期若某 skill 无附属文件，工具仍注册；调用不存在路径则报错即可。

### 5.3 System 广告（概念）

在现有「可用工具」列表之外增加：

```text
可用 Skills（任务匹配时先调用 agent_load_skill 加载完整说明，再执行）：
- host-health-check: <description>
- ...
```

API 工具名遵循现有 Registry 的点号转下划线规则（如 `agent_load_skill`）。

## 6. UI

- 一期 **不新增** 技能商店、点选面板、设置项。
- 复用现有工具调用气泡：展示「加载技能：&lt;name&gt;」等可读文案即可。

## 7. 实现要点（供计划拆分）

1. `catalog.js`：同步扫描 `skills/*/SKILL.md`，解析 YAML frontmatter；启动或首次 Agent 回合时缓存。
2. `loader.js`：按 name 读正文；资源路径规范化与越界检查。
3. `tools/skills.js`：注册两个工具；接入 `tools/index.js`。
4. `runtime.js`：`buildSystemPrompt` 增加 skills 广告。
5. 编写 8 个 `SKILL.md`。
6. 打包：`package.json` `files`、electron-builder `files` 加入 `skills`。
7. 测试：catalog 扫描数量与 name；`load_skill` 成功/未知名；路径逃逸拒绝；可选 runtime 单测断言 prompt 含 skill 名。

## 8. 验收标准

1. 无关闲聊可不加载 skill，对话仍正常。
2. 「帮我体检一下这台机器」→ 出现 `agent.load_skill`（`host-health-check`）→ 再调用 metrics / `ssh.exec` 等只读工具。
3. 「Pod 起不来」且已绑定集群 → 加载 `k8s-pod-troubleshoot` → 使用 K8s 只读工具。
4. 重启类 skill 触发写操作 → 仍弹出确认；拒绝后不执行。
5. 应用内可扫描到 8 个内置 skill；`npm run check` / 现有 agent 检查通过。
6. npm 包与打包产物中含 `skills/`。

## 9. 后续（不在本期）

- 用户目录 skills 覆盖/追加（原方案 B）
- 远程清单安装与更新（原方案 C）
- `run_skill_script` 与更细的 `allowed-tools` 执行约束
