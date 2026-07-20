---
name: service-status-check
description: 检查 systemd 服务或进程状态、监听端口与近期日志。在用户提到服务挂了、起不来、端口不通、service status、systemctl 时使用。
---

# 服务状态检查

## 何时使用

用户要确认某服务是否运行、端口是否监听、近期有无重启或报错。

## 步骤

1. 若已绑定 SSH 目标：直接在该主机上检查；**不要** `server_list`，也不要让用户从全部服务器里再选。若服务名不明确，用 `agent_ask_user` **只追问服务名**。若未绑定：`server_list` 或 `agent_ask_user`。
2. 只读 `ssh_exec` 检查状态，例如：
   - `systemctl status <service> --no-pager`
   - `systemctl is-active <service>`
   - `ss -tlnp` 或 `netstat -tlnp`（视系统可用命令）
   - `ps aux | grep -E '<pattern>' | grep -v grep`
3. 用 `ssh_tail_log` 或只读 `ssh_exec`（`journalctl -u <service> -n 100 --no-pager`）查看近期日志。
4. 汇总：运行状态、端口、关键错误；**全程只读，不要重启或改配置**；不要臆造未执行命令的结果。
