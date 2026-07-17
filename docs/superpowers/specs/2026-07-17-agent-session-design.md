# Agent 会话设计规格

**日期：** 2026-07-17  
**产品：** SSH 工具箱（ssh-toolbox）  
**状态：** 已评审通过，待实现计划  

## 1. 目标与范围

### 1.1 一期目标

在桌面端增加 **Agent 会话**：用户通过自然语言聊天，驱动本机已有能力完成运维与操作，包括：

- SSH：命令执行、日志、主机监控、SFTP 读写删
- K8s：集群/命名空间/Pod 浏览、Pod 日志、exec、指标；可选资源变更（后半段）

能力完整交付，按层实现与验收，不做功能阉割。远程入口（飞书、微信、语音）明确为 **二期**，本期只预留通道接口。

### 1.2 非目标（一期不做）

- 飞书 / 微信 / 语音等远程通道实现
- 云端托管对话、多人协作 ACL
- 定时巡检机器人
- 绕过确认的完全无人值守高危执行

### 1.3 已确认决策

| 项 | 决策 |
|----|------|
| 架构 | 本机 Agent Runtime + Tool Registry（主进程） |
| LLM | OpenAI 兼容协议：Base URL + API Key + Model |
| 安全 | 可配置策略（严格 / 标准 / 宽松），默认「标准」 |
| UI | 侧栏 Agent 总入口 + SSH 会话内 Agent 页 |
| 范围 | SSH + K8s 均进工具层；分层交付与 check |

## 2. 架构

```
┌─────────────────────────────────────────┐
│  UI：侧栏 Agent + 会话内 Agent 页        │
│  （消息、确认弹窗、选服务器/集群）        │
└─────────────────┬───────────────────────┘
                  │ IPC
┌─────────────────▼───────────────────────┐
│  Agent Runtime（主进程）                 │
│  · LLM Client（OpenAI 兼容 URL+Key）     │
│  · Tool Registry + 执行编排              │
│  · Policy Engine（严格/标准/宽松）       │
│  · Session Store（对话历史）             │
└─────────────────┬───────────────────────┘
                  │ 调用既有能力
┌─────────────────▼───────────────────────┐
│  Executors：SSH / SFTP / Metrics / K8s   │
│  （复用现有 main/*.js）                   │
└─────────────────────────────────────────┘

二期：Channel Adapter（飞书/微信）→ 同一 Runtime
```

### 2.1 原则

- UI 不直接持有 API Key、不直接拼危险命令；一律经 Runtime + 策略引擎。
- 每个工具统一契约：`name` / `description` / `riskLevel` / `inputSchema` / `execute` / `available`。
- 未实现的工具在注册表中标记 `unavailable`，避免模型误调。
- 二期远程通道只增加 Adapter，不复制工具与策略。

### 2.2 建议目录结构（实现时）

```
main/agent/
  runtime.js      # 编排循环
  llm-client.js   # OpenAI 兼容请求
  policy.js       # 策略与命令风险分类
  tools/          # 各工具注册与实现
  sessions.js     # 会话持久化
src/agent-ui.js   # 侧栏与聊天 UI
```

## 3. 工具清单与风险分级

### 3.1 风险档位

| 级别 | 含义 | 标准策略 | 严格 | 宽松 |
|------|------|----------|------|------|
| `read` | 只读 | 自动执行 | 自动 | 自动 |
| `write` | 会改状态 | 需确认 | 需确认 | 可自动 |
| `danger` | 高危破坏性 | 需确认 | 可拒绝或强制确认 | 需确认 |

策略档位用户可配置，默认 **标准**。确认选项建议支持：允许一次 / 允许本会话同类 / 拒绝。确认超时视为拒绝。

### 3.2 SSH / 主机工具

| 工具 | 风险 | 作用 |
|------|------|------|
| `server.list` | read | 列出已保存服务器 |
| `server.connect` | write | 建立或复用 SSH 会话 |
| `ssh.exec` | 动态 | 执行命令；由分类器升为 read/write/danger |
| `ssh.tail_log` | read | 读取或跟踪日志文件 |
| `metrics.fetch` | read | CPU / 内存 / 磁盘 / GPU |
| `sftp.list` | read | 列远程目录 |
| `sftp.read` | read | 读远程文件 |
| `sftp.write` / `sftp.upload` | write | 写文件 / 上传 |
| `sftp.delete` | write 或 danger | 删除；破坏性路径升为 danger |

`ssh.exec` 分类规则（实现层细化）：

- read：如 `ls`、`df`、`free`、`top -bn1`、`systemctl status`、`journalctl`（无破坏参数）等
- write：改配置、重启服务、安装包、写重定向等
- danger：`rm -rf`、磁盘格式化、批量 `kill -9`、改关键权限等模式

### 3.3 K8s 工具

| 工具 | 风险 | 作用 |
|------|------|------|
| `k8s.list_clusters` | read | 已保存集群 |
| `k8s.list_namespaces` | read | 命名空间 |
| `k8s.list_pods` | read | Pod 列表 |
| `k8s.pod_logs` | read | Pod 日志 |
| `k8s.metrics` | read | 指标（Metrics API / Prometheus 回退） |
| `k8s.pod_exec` | write | 容器内命令 |
| `k8s.apply` / `k8s.delete` | danger | 资源变更；放在 K8s 层后半段 |

### 3.4 Agent 元工具

| 工具 | 风险 | 作用 |
|------|------|------|
| `agent.ask_user` | read | 缺信息时追问（选服务器、命名空间等） |
| `agent.summarize_result` | read | 可选：压缩过长工具输出后再回灌 |

## 4. 会话模型与 UI

### 4.1 会话模型

- Agent 会话独立于 SSH 标签，标识为 `agentSessionId`。
- 绑定目标（Target）可为空、单个或多个：
  - SSH：`serverId`，可选复用 `sshSessionId`
  - K8s：`clusterId`、`context`、可选 `namespace`
- 缺目标时 Runtime 通过 `agent.ask_user` 或工具列表辅助选定。
- 对话历史本机持久化；API Key 与密码不写入历史明文。

### 4.2 UI

1. **侧栏「库存」新增 Agent**  
   会话列表、新建对话、聊天工作台；顶栏展示模型状态、策略档位、当前绑定目标；消息流中工具调用以可折叠卡片展示。

2. **SSH 会话工具栏增加「Agent」分段**  
   与终端 / SFTP / 监控并列；默认绑定当前服务器；可跳转侧栏完整会话。

3. **设置增加 Agent 区**  
   Base URL、API Key（safeStorage 加密）、Model、默认策略、超时、`maxSteps`（默认建议 12）。

### 4.3 确认流

```
模型 tool_calls
  → Policy Engine 判定 risk + 策略档
  → 允许自动 → 执行
  → 需确认 → UI 确认卡（目标、工具、参数、风险说明）
       → 允许一次 / 允许本会话同类 / 拒绝
  → 结果回灌模型 → 继续或纯文本回复用户
```

错误（连接失败、权限不足、策略拒绝）以中文展示在聊天气泡中。过长输出截断存储，UI 提供展开或「在终端打开」。

## 5. LLM 协议与存储

### 5.1 LLM

- OpenAI 兼容：`POST {baseUrl}/v1/chat/completions`，使用 `tools` / `tool_calls`。
- 主进程发请求；编排循环直到无 tool_calls 或达到 `maxSteps`。
- System prompt 固定约束：仅用已注册且 available 的工具、遵守风险规则、禁止臆造执行结果、信息不足先追问。

### 5.2 存储

| Store | 内容 |
|-------|------|
| `agent-settings` | baseUrl、model、策略、maxSteps、超时（不含明文 Key） |
| `credentials`（扩展） | `agentApiKey` 加密 |
| `agent-sessions` | 会话元数据、消息、tool 摘要、绑定目标 |

## 6. 分层交付与验收

| 层 | 交付 | 验收要点 |
|----|------|----------|
| L1 | 设置 + LLM 连通（无工具闲聊） | 配置 URL/Key/Model 后可对话 |
| L2 | 侧栏 Agent UI + 会话持久化 | 新建、续聊、历史恢复 |
| L3 | SSH 只读工具 + 服务器绑定 | 日志、监控、只读命令正确 |
| L4 | 策略引擎 + 确认流 | 写/高危弹出确认；拒绝生效 |
| L5 | SSH 写操作 + SFTP 写删 | 确认后实际生效 |
| L6 | 会话内 Agent 页 | 自动绑定当前 SSH 会话 |
| L7 | K8s 只读工具 | 列表、日志、指标 |
| L8 | K8s 写（exec / 可选 apply·delete） | 确认后生效 |

规则：实现一层 → check → 本地点验通过 → 再下一层。

## 7. 二期预留接口

```
Channel Adapter：
  onMessage(channelUser, text) → Agent Runtime
  requestConfirm / onConfirmResponse
  reply(channelUser, text | cards)
```

飞书、微信、语音只实现 Adapter，复用同一 Runtime、Tool Registry、Policy Engine。

## 8. 测试与风险

### 8.1 测试关注点

- LLM 无 Key / 错误 URL 时的友好错误
- 只读工具不误伤；写操作未确认不得执行
- 命令风险分类误判的可调空间（可后续加用户覆盖规则）
- 长输出与 `maxSteps` 截断行为
- 多服务器绑定与会话内默认绑定不串台

### 8.2 主要风险

- 中转 API 兼容性差异（tools 字段支持）→ L1 用探测或文档说明
- `ssh.exec` 分类器过严/过松 → 默认偏保守，宽松档可放宽 write
- K8s API 形态已与 client-node v1 对齐，工具层复用 `main/k8s.js` 修复后的解析方式

## 9. 成功标准

一期完成时用户可以：

1. 在设置中配置中转 URL + Key + 模型并成功闲聊  
2. 在侧栏 Agent 中绑定服务器，用自然语言查看日志与监控  
3. 对写操作/高危命令按策略确认后执行  
4. 在已连接 SSH 会话中打开 Agent 页并继承当前机上下文  
5. 对已导入 K8s 集群完成浏览、日志、指标，并在确认后 exec（及可选变更）  
6. 代码与文档中存在明确的 Channel Adapter 预留，二期可接入飞书/微信而不重写工具层  
