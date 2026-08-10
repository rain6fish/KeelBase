# 离线 / 内网部署指南（POV-3）

> 政企内网 / 无外网环境部署 ShiYu-AppBase。核心矛盾：`docker pull` 与云端依赖在离线环境不可用。
> 本指南给两套方案：**离线镜像预置**（推荐，含外部依赖降级）+ **纯内网联机**（有内网镜像仓库）。

Related manuals / 相关手册：
- [一键部署指南](one-click-deploy.md)（联网版 D.7）
- [运维手册](operations.md)

---

## 1. 离线环境的两个缺口

| 缺口 | 说明 | 本方案 |
|------|------|--------|
| 镜像拉取 | `docker pull` 需外网 | 可联网机器预置 → 内网 load / 内网 registry |
| 外部依赖 | SMTP / 推送 / 短信 / OAuth 均走云端 | 默认降级关闭，可配内网替代 |

## 2. 方案 A：离线镜像预置 + 一键脚本（推荐）

### 2.1 在可联网机器预置镜像

```bash
# 拉取基础镜像
docker pull pgvector/pgvector:pg17
docker pull redis:7-alpine
docker pull node:22-alpine
docker pull nginx:alpine
# 构建本基座镜像
docker compose build
# 导出为 tar（拷贝到内网机器）
docker save pgvector/pgvector:pg17 redis:7-alpine node:22-alpine nginx:alpine -o images.tar
```

### 2.2 内网机器 load + 部署

```bash
# 1. 拷贝代码 + images.tar 到内网机器
# 2. 加载镜像
docker load -i images.tar
# 3. 离线一键部署（外部依赖自动降级）
./deploy/deploy-offline.sh
#   或指定内网 registry（需 2.1 改为 push 到内网仓库 + 改 compose 引用）
# IMAGE_REGISTRY=harbor.internal/base ./deploy/deploy-offline.sh
```

`deploy-offline.sh` 会：
1. 校验关键镜像存在
2. 生成 `.env.production`（随机密钥 + **默认降级**：`MAIL_ENABLED=false` `PUSH_DRIVER=none` `SMS_DRIVER=none` `OAUTH_ENABLED_PROVIDERS=`）
3. 起容器 + 建管理员

## 3. 内网 AI（可选）

配置 `OLLAMA_BASE_URL` 指向内网 Ollama，AI 对话 / 向量检索全走本地（数据不出域）：

```bash
# 内网机器装 Ollama 并拉模型
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b
ollama pull bge-m3
# .env.production 加：
# OLLAMA_BASE_URL=http://localhost:11434
# AI_PROVIDER=ollama
```

## 4. 外部依赖的内网替代

| 依赖 | 离线默认 | 内网替代 |
|------|---------|---------|
| 邮件 SMTP | 关闭（`MAIL_ENABLED=false`） | 内网 SMTP 服务器，配 `SMTP_HOST` 等 |
| 推送 | `PUSH_DRIVER=none` | 无内网推送通道则保持关闭（站内通知 + SSE 仍可用） |
| 短信 | `SMS_DRIVER=none` | 内网短信网关 / console 驱动（验证码打印日志） |
| OAuth 第三方登录 | 关闭 | 内网 IdP 需自定义 provider（预留 OAUTH_ENABLED_PROVIDERS） |
| 文件存储 | `STORAGE_DRIVER=local` | 本地磁盘；可配 S3 兼容（MinIO）内网对象存储 |

## 5. 故障排查

```bash
docker compose logs server | tail -50        # 后端日志（确认无外网调用报错）
docker compose exec postgres psql -U postgres -d front_production -c '\dt'   # 检查表
curl http://localhost:3000/api/v1/health     # 健康检查
```
