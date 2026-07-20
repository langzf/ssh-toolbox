---
name: safe-service-restart
description: 安全重启 systemd 服务：重启前检查 → 用户确认 → 执行重启 → 验证恢复。在用户提到重启服务、reload、restart service、systemctl restart 时使用。
---

# 安全服务重启

## 何时使用

用户要求重启某个服务，且需要先确认当前状态再执行写操作。

## 步骤

1. 若未绑定 SSH 目标：`server_list` 或 `agent_ask_user`；确认要重启的服务名。
2. **重启前只读检查**（同 service-status-check）：`systemctl status`、`ss -tlnp`、近期 `journalctl`。
3. **提出重启命令**（如 `systemctl restart <service>`），说明影响范围，**等待用户确认**后再调用 `ssh_exec`（写操作会触发确认流程）。
4. 用户拒绝确认则**不执行**，告知已取消。
5. 确认并执行后，再次只读验证：`systemctl is-active`、端口、关键日志；汇总前后对比。
6. **不要臆造重启结果**；未获确认前不得执行写命令。
