---
name: config-change-checklist
description: 改配置前的备份、校验与回滚清单（写操作需用户确认）。在用户提到改配置、nginx 配置、生效配置、config change、backup config 时使用。
---

# 配置变更清单

## 何时使用

用户要修改远程配置文件，需要先备份、了解现状并规划回滚。

## 步骤

1. 若已绑定 SSH 目标：直接在该主机操作，禁止 `server_list` / 让用户从全部服务器再选；确认配置路径与变更意图可用 `agent_ask_user`。若未绑定：`server_list` 或 `agent_ask_user`。
2. **只读现状**：`sftp_read` 读取当前配置；必要时 `ssh_exec` 做语法检查（如 `nginx -t`、`sshd -t`，只读校验）。
3. **备份方案**：提出备份命令或 `sftp_read` 保存副本到本地思路；实际写入/上传（`sftp_write`、`sftp_upload`）**须等待用户确认**。
4. **变更步骤**：列出拟修改内容与验证命令（reload/restart）；写操作 **先 propose → 等待确认 → 再执行**。
5. **回滚提示**：说明如何从备份恢复；若需 `ssh_exec` / `sftp_write` 回滚，同样须确认。
6. 执行后只读验证配置与服务状态；不要臆造未执行的检查结果。
