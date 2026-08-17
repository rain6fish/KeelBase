# Blue-Green & Canary Deployment / 蓝绿与金丝雀部署（D.3）

> 在生产 compose（Nginx + server + PostgreSQL + Redis 单容器编排）基础上，用**两套 server 应用容器**（server-blue / server-green，共用同一 DB）实现零停机发布与快速回滚。
> 在单容器 compose 编排基础上，用两套 server 容器实现蓝绿发布与金丝雀灰度。

Related / 相关：[One-Click Deploy](one-click-deploy.md) · [Offline Deploy](offline-deploy.md) · [Operations](operations.md)

---

## 1. 原理 / How it works

- **两个应用容器** `server-blue` / `server-green`：同一 PostgreSQL/Redis，仅应用镜像不同，端口不暴露、经 Nginx upstream 分流。
  **两套应用容器**：共用数据库，镜像版本不同，由 Nginx upstream 分发。
- **Nginx upstream**（`deploy/nginx-bluegreen.conf`）按 `weight` 分配流量：蓝绿=100/0 全量切换；金丝雀=逐步调 weight。
- **发布流程**：新镜像部署到非活跃容器 → 健康检查通过 → 切 weight → 保留旧容器供回滚。

## 2. 前置 / Prerequisites

| 项 | 说明 |
|----|------|
| Nginx upstream 挂载 | 把宿主机 `NGINX_CONF`（脚本默认 `/tmp/keelbase-upstream.conf`）挂载到 nginx 容器的 `/etc/nginx/conf.d/upstream.conf`，并让默认 `proxy_pass http://server:3000` 改用该 upstream |
| 容器同网络 | `server-blue`/`server-green` 与 nginx 在同一 docker compose 网络（默认 `<project>_default`） |
| 环境文件 | `ENV_FILE` 默认 `Server-NestJS/.env.production`（DB 连接等），两容器共用 |
| 健康检查 | 容器内需有 `wget`（server 镜像已装，见 Dockerfile） |

## 3. 蓝绿发布 / Blue-green deploy

```bash
# 1. 构建本次发布镜像
docker build -t keelbase-server:latest --target server Server-NestJS

# 2. 部署到非活跃版本并全量切换
IMAGE=keelbase-server:latest ./deploy/blue-green.sh deploy

# 3. 确认新版本正常后，清理旧容器
docker rm -f server-$(cat /tmp/keelbase-bluegreen/active)
```

- 切换失败（健康检查不过）脚本自动回滚到原版本并退出。
- `./deploy/blue-green.sh status` 查看当前活跃版本与权重。

## 4. 金丝雀 / Canary

```bash
# 先 deploy 一次（green 已就绪），再逐步放量
./deploy/blue-green.sh canary 5     # 5% 流量到新版本
./deploy/blue-green.sh canary 50    # 观察后 50%
./deploy/blue-green.sh deploy       # 全量切换
```

## 5. 回滚 / Rollback

```bash
./deploy/blue-green.sh rollback     # 切回上一活跃版本（旧容器仍在）
```

- 蓝绿的优势：回滚=一次 weight 切换，秒级；旧容器保留，无需重构建。
- 回滚后如需清理新版本容器：`docker rm -f server-<版本>`。

## 6. 注意事项 / Notes

- **共用 DB**：两容器写同一库，蓝绿期间旧版本仍在写——适用于向后兼容的变更；破坏性 schema 变更请先迁移再切换（参考 [migrations](operations.md#3-database-migration--数据库迁移)）。
- **Nginx reload**：脚本自动 `nginx -s reload`；若 nginx 容器名不同，设 `NGINX_CONTAINER`。
- **单机简化**：本方案面向单机 docker compose 生产；多机/负载均衡场景可把 upstream 换成 LB 节点。
