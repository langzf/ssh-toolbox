---
name: host-health-check
description: 对已绑定 SSH 主机做健康体检（负载、内存、磁盘、关键进程）。在用户提到体检、健康检查、机器状态、host health、health check 时使用。
---

# 主机体检

## 何时使用

用户要了解主机是否健康、资源是否紧张、有无异常进程。

## 步骤

1. 若未绑定 SSH 目标：调用 `server_list` 列出服务器，或 `agent_ask_user` 请用户选择/绑定目标。
2. 调用 `metrics_fetch` 获取 CPU、内存、磁盘（及 GPU 如有）。
3. 必要时用只读 `ssh_exec` 补充：`uptime`、`free -h`、`df -h`、`ps aux --sort=-%cpu | head`。
4. 用中文汇总异常项与建议；**不要臆造未执行命令的结果**。
