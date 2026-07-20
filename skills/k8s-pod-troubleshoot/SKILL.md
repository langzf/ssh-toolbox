---
name: k8s-pod-troubleshoot
description: 排查 Kubernetes Pod 异常：状态、事件、日志与资源指标。在用户提到 Pod 起不来、CrashLoop、Pending、Pod 异常、k8s troubleshoot 时使用。
---

# K8s Pod 排查

## 何时使用

Pod 非 Running、反复重启、Pending，或用户要诊断容器异常。

## 步骤

1. 若未绑定 K8s 集群：`k8s_list_clusters` 或 `agent_ask_user` 选择集群与命名空间。
2. `k8s_list_pods` 查看目标 Pod 的 phase、ready、restartCount。
3. `k8s_pod_logs` 读取异常 Pod 日志（指定 `podName`，必要时 `container`、`tailLines`）。
4. `k8s_metrics` 查看 CPU/内存是否触顶或 throttling。
5. 需要容器内诊断时，可 **提出** `k8s_pod_exec` 只读命令（如 `ls`、`env`）；**写操作须等待用户确认**。
6. 汇总：状态、日志要点、资源与建议；**全程优先只读**；不要臆造未拉取的日志或指标。
