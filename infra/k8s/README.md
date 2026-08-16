# KeelBase Kubernetes 部署（D.2）/ Deployment Guide

生产 Kubernetes 清单。镜像：`rain6fish/keelbase:<tag>`（含 NestJS 后端 + Web-Admin 静态托管 + Flutter web）。

## 部署 / Deploy

```bash
kubectl create ns keelbase
# 敏感配置（勿提交真实值）
kubectl -n keelbase create secret generic keelbase-secret \
  --from-literal=DB_PASSWORD=... --from-literal=JWT_SECRET=... \
  --from-literal=JWT_REFRESH_SECRET=... --from-literal=ENCRYPTION_KEY=...
# 或 sealed-secrets / external-secrets
kubectl apply -f infra/k8s/namespace.yaml -f infra/k8s/configmap.yaml -f infra/k8s/secret.yaml
kubectl apply -f infra/k8s/backend-deployment.yaml -f infra/k8s/backend-hpa.yaml -f infra/k8s/backend-service.yaml
kubectl apply -f infra/k8s/ingress.yaml
kubectl -n keelbase rollout status deploy/keelbase-backend
```

先决条件：K8s 集群 + nginx-ingress + cert-manager（TLS）+ PostgreSQL/Redis（可托管或集群内）。

## 组件 / Components

| 文件 | 说明 |
|------|------|
| namespace.yaml | 命名空间 |
| configmap.yaml | 非敏感环境变量 |
| secret.yaml | 敏感配置占位（生产用 k8s secret 注入） |
| backend-deployment.yaml | 主 Deployment：滚动更新（maxUnavailable 0）、readiness/liveness 探针、资源限制、优雅停机 |
| backend-hpa.yaml | HPA：CPU 70% → 2~10 副本 |
| backend-service.yaml | ClusterIP Service |
| ingress.yaml | 入口 + TLS + SSE 长连接超时 |
| canary-ingress.yaml | 金丝雀流量切分（D.3） |

## 故障恢复 / Failure Recovery（D.2）

- **自动伸缩**：HPA 按 CPU 在 2~10 副本伸缩。
- **滚动更新**：`maxUnavailable: 0, maxSurge: 1` —— 更新期间保持可用副本不降级。
- **故障重启**：liveness 探针失效 → kubelet 重启容器；readiness 未就绪 → 不接流量。
- **节点故障**：ReplicaSet 自动在健康节点补副本。
- **优雅停机**：SIGTERM 前 `preStop sleep 5`，完成在途请求。

## 蓝绿发布（D.3）/ Blue-Green

1. 部署 `backend-blue`（当前）与 `backend-green`（新版本）两套 Deployment + Service。
2. Ingress 指向 `blue` Service → 全部流量在蓝。
3. 验证 green 健康后，把 Ingress backend 切到 `green`（`kubectl edit ingress` 改 service 名）→ 全量切到绿。
4. 观察稳定后删蓝；异常则一秒切回蓝。

```bash
# 切换：改 ingress 的 service name keelbase-backend-blue → keelbase-backend-green
kubectl -n keelbase patch ingress keelbase --type=json \
  -p '[{"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/name","value":"keelbase-backend-green"}]'
```

## 金丝雀发布（D.3）/ Canary

见 `canary-ingress.yaml`：canary Deployment 接 10% 流量（nginx canary 注解），`x-canary` header 可强制走 canary（测试用户/内部验证）。观察错误率/延迟后逐步 `canary-weight` 30→50→80→100，稳定后提升主 Deployment 镜像、移除 canary。

## 注意 / Notes

- 迁移：首次部署需先跑 `npm run migration:run`（或 initJob），主库建表后副本追平。
- 3.3 读写分离：configmap 配 `DB_READ_REPLICAS` 即可，TypeORM 自动读从库写主库（见 docs/infra-read-write-split.md）。
