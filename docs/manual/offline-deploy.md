# Offline / On-Prem Deployment Guide / 离线·内网部署指南（POV-3）

> For government/enterprise intranets or air-gapped environments. Core tension: `docker pull` and cloud dependencies are unavailable offline.
> 政企内网 / 无外网环境部署 KeelBase。核心矛盾：`docker pull` 与云端依赖在离线环境不可用。
> This guide gives two options: **offline image staging** (recommended, with external-dependency degradation) + **fully on-prem connected** (with an intranet registry).
> 本指南给两套方案：**离线镜像预置**（推荐，含外部依赖降级）+ **纯内网联机**（有内网镜像仓库）。

Related manuals / 相关手册：
- [One-Click Deploy / 一键部署指南](one-click-deploy.md)（联网版 D.7 / online D.7）
- [Operations Manual / 运维手册](operations.md)

---

## 1. Two Gaps in an Offline Environment / 离线环境的两个缺口

| Gap / 缺口 | Description / 说明 | This guide / 本方案 |
|------|------|--------|
| Image pull / 镜像拉取 | `docker pull` needs internet / 需外网 | Stage on a connected machine → load on intranet / registry / 可联网机器预置 → 内网 load / 内网 registry |
| External deps / 外部依赖 | SMTP / push / SMS / OAuth all go to the cloud / 均走云端 | Degraded off by default; intranet alternatives available / 默认降级关闭，可配内网替代 |

## 2. Option A: Offline Image Staging + One-Click Script (Recommended) / 方案 A：离线镜像预置 + 一键脚本（推荐）

### 2.1 Stage Images on a Connected Machine / 在可联网机器预置镜像

```bash
# Pull base images / 拉取基础镜像
docker pull pgvector/pgvector:pg17
docker pull redis:7-alpine
docker pull node:22-alpine
docker pull nginx:alpine
# Build the base image / 构建本基座镜像
docker compose build
# Export as tar (copy to the intranet machine) / 导出为 tar（拷贝到内网机器）
docker save pgvector/pgvector:pg17 redis:7-alpine node:22-alpine nginx:alpine -o images.tar
```

### 2.2 Load + Deploy on the Intranet Machine / 内网机器 load + 部署

```bash
# 1. Copy code + images.tar to the intranet machine / 拷贝代码 + images.tar 到内网机器
# 2. Load the images / 加载镜像
docker load -i images.tar
# 3. Offline one-click deploy (external deps auto-degrade) / 离线一键部署（外部依赖自动降级）
./deploy/deploy-offline.sh
#    Or point at an intranet registry (requires 2.1 to push + change compose references)
#    或指定内网 registry（需 2.1 改为 push 到内网仓库 + 改 compose 引用）
# IMAGE_REGISTRY=harbor.internal/base ./deploy/deploy-offline.sh
```

`deploy-offline.sh` will / `deploy-offline.sh` 会：
1. Verify the key images exist / 校验关键镜像存在
2. Generate `.env.production` (random secrets + **degraded by default**: `MAIL_ENABLED=false` `PUSH_DRIVER=none` `SMS_DRIVER=none` `OAUTH_ENABLED_PROVIDERS=`)
   生成 `.env.production`（随机密钥 + **默认降级**：`MAIL_ENABLED=false` `PUSH_DRIVER=none` `SMS_DRIVER=none` `OAUTH_ENABLED_PROVIDERS=`）
3. Start containers + create the admin account / 起容器 + 建管理员

## 3. On-Prem AI (Optional) / 内网 AI（可选）

Point `OLLAMA_BASE_URL` at an intranet Ollama so AI chat / vector search stay fully local (data never leaves the premises)：

配置 `OLLAMA_BASE_URL` 指向内网 Ollama，AI 对话 / 向量检索全走本地（数据不出域）：

```bash
# Install Ollama on the intranet machine and pull models / 内网机器装 Ollama 并拉模型
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b
ollama pull bge-m3
# .env.production add: / .env.production 加：
# OLLAMA_BASE_URL=http://localhost:11434
# AI_PROVIDER=ollama
```

## 4. Intranet Alternatives for External Dependencies / 外部依赖的内网替代

| Dependency / 依赖 | Offline default / 离线默认 | Intranet alternative / 内网替代 |
|------|---------|---------|
| Email SMTP / 邮件 SMTP | Off (`MAIL_ENABLED=false`) / 关闭 | Intranet SMTP server, set `SMTP_HOST` etc. / 内网 SMTP 服务器，配 `SMTP_HOST` 等 |
| Push / 推送 | `PUSH_DRIVER=none` | Keep off without an intranet channel (in-app + SSE still work) / 无内网推送通道则保持关闭（站内通知 + SSE 仍可用） |
| SMS / 短信 | `SMS_DRIVER=none` | Intranet SMS gateway / console driver (codes printed to log) / 内网短信网关 / console 驱动（验证码打印日志） |
| OAuth login / OAuth 第三方登录 | Off / 关闭 | Custom provider via `OAUTH_ENABLED_PROVIDERS` (reserved) / 内网 IdP 需自定义 provider（预留 OAUTH_ENABLED_PROVIDERS） |
| File storage / 文件存储 | `STORAGE_DRIVER=local` | Local disk; S3-compatible (MinIO) intranet object storage / 本地磁盘；可配 S3 兼容（MinIO）内网对象存储 |

## 5. Troubleshooting / 故障排查

```bash
docker compose logs server | tail -50        # backend logs (confirm no external calls fail) / 后端日志（确认无外网调用报错）
docker compose exec postgres psql -U postgres -d front_production -c '\dt'   # check tables / 检查表
curl http://localhost:3000/api/v1/health     # health check / 健康检查
```
