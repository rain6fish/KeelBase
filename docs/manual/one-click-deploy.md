# 一键部署指南（D.7）

> KeelBase 私有化部署最后一公里：deploy.sh 自动完成 环境初始化 → HTTPS（可选）→ 容器构建启动 → 建管理员账号。
> 面向对象：阿里云/腾讯云等轻量应用服务器（2C4G 起步）。

Related manuals / 相关手册：
- [Operations Manual / 运维手册](operations.md)
- [Development Manual / 开发手册](development.md)

---

## 1. 前置要求

| 项 | 要求 |
|----|------|
| 服务器 | 2 核 4G 起（NestJS + PostgreSQL + Redis + Nginx/Flutter web 同机） |
| OS | Ubuntu 22.04 / Debian 12 / CentOS 8+（64 位） |
| Docker | 20.10+，含 Docker Compose v2 |
| 域名（可选） | 用于 HTTPS；无域名可先 HTTP 部署 |

安装 Docker（Ubuntu/Debian）：

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
```

## 2. 部署

```bash
# 1. 拉取代码（或上传压缩包）
git clone https://github.com/rain6fish/KeelBase.git && cd KeelBase

# 2. HTTP 一键部署（首次构建 10-20 分钟）
./deploy/deploy.sh

# HTTPS 部署（自动生成自签名证书，生产建议配真实证书）
HTTPS=1 ./deploy/deploy.sh

# 自定义管理员初始密码
ADMIN_PASSWORD='你的强密码' ./deploy/deploy.sh
```

deploy.sh 做了什么：

1. 校验 Docker / Compose
2. 生成 `Server-Nodejs/.env.production`（缺失时从示例复制，并用 `openssl rand -hex 32` 生成随机 `JWT_SECRET` / `JWT_REFRESH_SECRET` / `ENCRYPTION_KEY` / `DB_PASSWORD`）
3. `HTTPS=1` 时生成自签名证书并叠加 `docker-compose.prod.yml`
4. `docker compose up --build -d` 启动 PostgreSQL + Redis + NestJS + Nginx
5. 等待后端健康后调用 `create:admin` 创建初始管理员

## 3. 部署后验证

```bash
docker compose ps                 # 全部 healthy
curl http://localhost:3000/api/v1/health   # {"status":"ok",...}
docker compose logs server | tail -20      # 启动日志 / 迁移执行
```

登录管理台（已随一键部署打包进 web 容器 `/admin` 子路径）：

```bash
# 部署完成后直接访问：
# 管理台  http://<服务器IP>/admin  （admin 账号登录）
```

> 若想独立域名部署管理台（如 admin.example.com）：单独 `cd Web-Admin && npm ci && npm run build`，
> 把 `dist/` 托管到独立域名即可（需把 Vite `base` 改为 `/`，或放在 `/admin` 子路径）。

## 4. 生产环境注意

| 项 | 说明 |
|----|------|
| 真实证书 | 生产替换 `certs/server.crt` / `certs/server.key` 为受信证书（Let's Encrypt 或云厂商），否则 HTTPS 会有证书告警 |
| 域名 CORS | 修改 `Server-Nodejs/.env.production` 的 `CORS_ORIGINS` 为真实域名后 `docker compose up -d` |
| 密钥保管 | `.env.production` 含敏感密钥，勿提交到 git；容器重建后沿用同一份 env 保证加密数据可解密 |
| 数据库备份 | `npm run backup`（见 operations.md），建议加 cron 每日执行 |
| 升级部署 | `git pull && ./deploy/deploy.sh`（增量构建，迁移由 `migrationsRun` 自动执行） |

## 5. 故障排查

```bash
docker compose logs server           # 后端日志
docker compose logs web              # Nginx 日志
docker compose exec postgres psql -U postgres -d front_production -c '\dt'   # 检查表
docker compose exec server npx ts-node scripts/create-admin.ts --username admin --password '新密码'  # 手动建管理员
```

> 私有化定位说明：数据主权在客户侧，PostgreSQL 数据卷 + 备份脚本即可满足合规。
