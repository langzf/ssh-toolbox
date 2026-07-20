---
name: k8s-workload-restart
description: 安全重启 Kubernetes 工作负载（如删除 Pod 触发重建）：重启前检查 → 用户确认 → 执行 → 验证。在用户提到重启 Pod、滚动重启、workload restart、k8s restart 时使用。
---

# K8s 工作负载安全重启

## 何时使用

用户要重启 Pod 或让 Deployment/StatefulSet 下的 Pod 重建，且需先确认影响再执行写操作。

## 步骤

1. 若未绑定 K8s 集群：`k8s_list_clusters` 或 `agent_ask_user`；确认 namespace、Pod 或 workload 名称。
2. **重启前只读检查**：`k8s_list_pods` 看当前副本与状态；`k8s_pod_logs` 看近期日志；`k8s_metrics` 看资源。
3. **提出重启方案**并说明影响，例如：
   - 单 Pod：`k8s_delete_pod`（高危，会触发确认）由控制器重建；
   - 或 **提出** `k8s_pod_exec` 执行容器内 reload（若适用）。
4. **等待用户确认**后再调用写/高危工具；用户拒绝则**不执行**。
5. 执行后：`k8s_list_pods` 确认新 Pod Running；`k8s_pod_logs` 验证启动正常。
6. 不要臆造重启结果；无专用 rollout 工具时，明确告知使用的是 Pod 删除重建等方式。
