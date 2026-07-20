---
name: disk-space-triage
description: 排查磁盘空间告警，定位大目录、日志膨胀并给出清理建议（删除操作需用户确认）。在用户提到磁盘满、空间不足、inode、disk full、disk space 时使用。
---

# 磁盘空间排查

## 何时使用

用户报告磁盘告警、分区使用率过高，或需要找出占用空间的目录/日志。

## 步骤

1. 若已绑定 SSH 目标：直接在该主机操作，禁止 `server_list` / 让用户从全部服务器再选。若未绑定：`server_list` 或 `agent_ask_user`。
2. 调用 `metrics_fetch` 查看各挂载点使用率。
3. 只读 `ssh_exec`：`df -h`、`df -i`；必要时 `du -xh --max-depth=1 /path | sort -hr | head`（先确认路径，避免全盘扫描过久）。
4. 用 `ssh_tail_log` 或 `sftp_list` 检查常见日志目录（如 `/var/log`）是否膨胀。
5. 给出清理建议；**删除、truncate、rm 等写操作必须先提出具体命令，等待用户确认后再执行**（`ssh_exec` / `sftp_delete` 会触发确认）。
6. 汇总发现与建议；不要臆造未执行命令的输出。
