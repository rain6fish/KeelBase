# One-Click Deployment Guide / 一键部署指南（D.7）

> The last mile of KeelBase private deployment: `deploy.sh` automates env initialization → HTTPS (optional) → container build & start → admin account creation.
> KeelBase 私有化部署最后一公里：deploy.sh 自动完成 环境初始化 → HTTPS（可选）→ 容器构建启动 → 建管理员账号。
> Audience: lightweight cloud servers (Alibaba Cloud / Tencent Cloud, 2C4G or higher). / 面向对象：阿里云/腾讯云等轻量应用服务器（2C4G 起步）。

Related manuals / 相关手册：
- [Operations Manual / 运维手册](operations.md)
- [Development Manual / 开发手册](development.md)

---

## 1. Prerequisites / 前置要求

| Item / 项 | Requirement / 要求 |
|----|------|
| Server / 服务器 | 2 cores / 4 GB or higher (NestJS + PostgreSQL + Redis + Nginx/Flutter web on one machine) / 2 核 4G 起（NestJS + PostgreSQL + Redis + Nginx/Flutter web 同机） |
| OS | Ubuntu 22.04 / Debian 12 / CentOS 8+ (64-bit) |
| Docker | 20.10+, with Docker Compose v2 |
| Domain (optional) / 域名（可选） | For HTTPS; HTTP deploy works without one / 用于 HTTPS；无域名可先 HTTP 部署 |

Install Docker (Ubuntu/Debian) / 安装 Docker（Ubuntu/Debian）：

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
```

## 2. Deployment / 部署

```bash
# 1. Clone the repo (or upload an archive) / 拉取代码（或上传压缩包）
git clone https://github.com/rain6fish/KeelBase.git && cd KeelBase

# 2. HTTP one-click deploy (first build 10-20 min) / HTTP 一键部署（首次构建 10-20 分钟）
./deploy/deploy.sh

# HTTPS deploy (auto-generates a self-signed cert; use a trusted cert for production) / HTTPS 部署（自动生成自签名证书，生产建议配真实证书）
HTTPS=1 ./deploy/deploy.sh

# Custom admin initial password / 自定义管理员初始密码
ADMIN_PASSWORD='your-strong-password' ./deploy/deploy.sh
```

What `deploy.sh` does / deploy.sh 做了什么：

1. Verify Docker / Compose / 校验 Docker / Compose
2. Generate `Server-Nodejs/.env.production` (copies from the example when missing, then generates random `JWT_SECRET` / `JWT_REFRESH_SECRET` / `ENCRYPTION_KEY` / `DB_PASSWORD` with `openssl rand -hex 32`)
   生成 `Server-Nodejs/.env.production`（缺失时从示例复制，并用 `openssl rand -hex 32` 生成随机 `JWT_SECRET` / `JWT_REFRESH_SECRET` / `ENCRYPTION_KEY` / `DB_PASSWORD`）
3. With `HTTPS=1`, generate a self-signed cert and overlay `docker-compose.prod.yml` / `HTTPS=1` 时生成自签名证书并叠加 `docker-compose.prod.yml`
4. `docker compose up --build -d` starts PostgreSQL + Redis + NestJS + Nginx / 启动 PostgreSQL + Redis + NestJS + Nginx
5. Wait for backend health, then call `create:admin` to create the initial admin / 等待后端健康后调用 `create:admin` 创建初始管理员

## 3. Post-Deploy Verification / 部署后验证

```bash
docker compose ps                 # all healthy / 全部 healthy
curl http://localhost:3000/api/v1/health   # {"status":"ok",...}
docker compose logs server | tail -20      # startup logs / migrations / 启动日志 / 迁移执行
```

Log in to the admin console (already bundled into the web container at `/admin`) / 登录管理台（已随一键部署打包进 web 容器 `/admin` 子路径）：

```bash
# Visit directly after deployment / 部署完成后直接访问：
# Admin console  http://<server-IP>/admin  (log in with the admin account)
# 管理台  http://<服务器IP>/admin  （admin 账号登录）
```

> To host the admin console on its own domain (e.g. admin.example.com): `cd Web-Admin && npm ci && npm run build`, then serve `dist/` on the domain (set Vite `base` to `/`, or keep it under `/admin`).
> 若想独立域名部署管理台（如 admin.example.com）：单独 `cd Web-Admin && npm ci && npm run build`，把 `dist/` 托管到独立域名即可（需把 Vite `base` 改为 `/`，或放在 `/admin` 子路径）。

## 4. Production Considerations / 生产环境注意

| Item / 项 | Notes / 说明 |
|----|------|
| Real certificate / 真实证书 | Replace `certs/server.crt` / `certs/server.key` with a trusted cert (Let's Encrypt or cloud provider) or HTTPS shows a cert warning / 生产替换 `certs/server.crt` / `certs/server.key` 为受信证书（Let's Encrypt 或云厂商），否则 HTTPS 会有证书告警 |
| Domain CORS / 域名 CORS | Set `CORS_ORIGINS` in `Server-Nodejs/.env.production` to the real domain, then `docker compose up -d` / 修改 `Server-Nodejs/.env.production` 的 `CORS_ORIGINS` 为真实域名后 `docker compose up -d` |
| Key custody / 密钥保管 | `.env.production` contains sensitive keys — never commit it; keep the same env across container rebuilds so encrypted data stays decryptable / `.env.production` 含敏感密钥，勿提交到 git；容器重建后沿用同一份 env 保证加密数据可解密 |
| DB backup / 数据库备份 | `npm run backup` (see operations.md); add a cron job to run daily / `npm run backup`（见 operations.md），建议加 cron 每日执行 |
| Upgrade deploy / 升级部署 | `git pull && ./deploy/deploy.sh` (incremental build; migrations auto-run via `migrationsRun`) / `git pull && ./deploy/deploy.sh`（增量构建，迁移由 `migrationsRun` 自动执行） |

## 5. Troubleshooting / 故障排查

```bash
docker compose logs server           # backend logs / 后端日志
docker compose logs web              # Nginx logs / Nginx 日志
docker compose exec postgres psql -U postgres -d front_production -c '\dt'   # check tables / 检查表
docker compose exec server npx ts-node scripts/create-admin.ts --username admin --password 'new-password'  # manual admin creation / 手动建管理员
```

> Private-deployment positioning: data sovereignty stays with the customer; the PostgreSQL data volume + backup script satisfy compliance.
> 私有化定位说明：数据主权在客户侧，PostgreSQL 数据卷 + 备份脚本即可满足合规。
