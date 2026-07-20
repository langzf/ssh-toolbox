---
name: log-investigation
description: 排查应用或系统日志，按路径、关键词、时间窗口定位报错。在用户提到查日志、报错、tail、log investigation、grep log 时使用。
---

# 日志排查

## 何时使用

用户要定位错误日志、分析近期异常、按关键词或时间筛选日志内容。

## 步骤

1. 若未绑定 SSH 目标：`server_list` 或 `agent_ask_user`；若用户未提供日志路径，用 `agent_ask_user` 确认文件路径或服务名。
2. 优先只读工具：`ssh_tail_log` 读取日志末尾（指定 `path` 与 `lines`）。
3. 需要关键词/时间过滤时，用只读 `ssh_exec`（如 `grep -E 'pattern' /path/to/log | tail -n 200`）；避免大范围 `cat` 整文件。
4. 可用 `sftp_list` 浏览日志目录，确认轮转文件（`.log.1`、`.gz` 等）。
5. 归纳错误模式、可能原因与下一步建议；**不要臆造未读取到的日志内容**。
