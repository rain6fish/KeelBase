#!/usr/bin/env bash
#
# KeelBase 一键部署脚本（D.7，私有化定位）
#
# 功能：
#   1. 检查 Docker / Docker Compose
#   2. 初始化 .env.production（缺失时从示例生成，并自动生成随机 JWT/加密密钥）
#   3. 可选：生成自签名 TLS 证书并启用 HTTPS（nginx.https.conf + docker-compose.prod.yml）
#   4. 构建并启动容器（PostgreSQL + Redis + NestJS + Nginx/Flutter web）
#   5. 创建初始管理员账号（生产环境 seed 不执行，需显式创建）
#
# 用法：
#   ./deploy/deploy.sh                 # HTTP 部署
#   HTTPS=1 ./deploy/deploy.sh         # HTTPS 部署（自动生成自签名证书）
#   ADMIN_PASSWORD='xxx' ./deploy/deploy.sh   # 指定初始管理员密码（默认 Admin@1234）
#
# 云厂商轻量服务器（阿里云/腾讯云）部署指南见 docs/manual/one-click-deploy.md

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="Server-NestJS/.env.production"
export NODE_ENV=production
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@1234}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"

# ── 1. 前置检查 ──────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { echo "✗ Docker 未安装。请先安装 Docker：https://docs.docker.com/engine/install/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "✗ Docker Compose v2 不可用。请升级 Docker。"; exit 1; }

echo "✓ Docker 就绪: $(docker --version)"

# ── 2. 初始化生产环境配置 ────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  cp "Server-NestJS/.env.production.example" "$ENV_FILE"
  # 生成随机密钥（openssl rand -hex 32）
  gen() { openssl rand -hex 32; }
  DB_PASS=$(gen)
  sed -i.bak \
    -e "s/^JWT_SECRET=.*/JWT_SECRET=$(gen)/" \
    -e "s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$(gen)/" \
    -e "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$(gen)/" \
    -e "s/^DB_PASSWORD=.*/DB_PASSWORD=$DB_PASS/" \
    -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$DB_PASS/" \
    -e "s/^DB_NAME=.*/DB_NAME=front_production/" \
    -e "s/^POSTGRES_DB=.*/POSTGRES_DB=front_production/" \
    "$ENV_FILE"
  rm -f "$ENV_FILE.bak"
  # 生产环境数据库走容器内 postgres 服务，host/密码对齐 docker-compose
  sed -i.bak \
    -e "s/^DB_HOST=.*/DB_HOST=postgres/" \
    -e "s/^REDIS_URL=.*/REDIS_URL=redis:\/\/redis:6379/" \
    "$ENV_FILE"
  rm -f "$ENV_FILE.bak"
  echo "✓ 已生成 $ENV_FILE（含随机密钥，请妥善保管）"
else
  echo "✓ 使用已有 $ENV_FILE"
fi

# ── 3. 生产配置（默认生产模式 + HTTPS）──────────────────────
# deploy.sh 面向生产部署：始终叠加 prod overlay（NODE_ENV=production、restart、HTTPS）。
# 证书缺失时生成自签名（生产建议替换为真实证书，见 docs/manual/one-click-deploy.md）。
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml)
mkdir -p certs
if [ ! -f certs/server.crt ] || [ ! -f certs/server.key ]; then
  echo "→ 生成自签名 TLS 证书（certs/server.{crt,key}）"
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout certs/server.key -out certs/server.crt \
    -days 365 -subj "/CN=localhost"
fi
echo "✓ 生产模式 + HTTPS（443 + 80）"

# ── 4. 构建并启动 ────────────────────────────────────────────
echo "→ 构建并启动容器（首次构建耗时较长）..."
docker compose "${COMPOSE_FILES[@]}" up --build -d

echo "→ 等待服务健康..."
for i in $(seq 1 30); do
  if docker compose "${COMPOSE_FILES[@]}" exec -T server wget -q --spider http://localhost:3000/api/v1/health 2>/dev/null; then
    echo "✓ 后端健康（端口 3000）"
    break
  fi
  sleep 2
  if [ "$i" = "30" ]; then echo "⚠ 后端未在 60s 内就绪，请查看 docker compose logs server"; fi
done

# ── 5. 创建管理员 ────────────────────────────────────────────
echo "→ 创建管理员账号（${ADMIN_USERNAME}）..."
docker compose "${COMPOSE_FILES[@]}" exec -T -e NODE_ENV=production server npx ts-node scripts/create-admin.ts \
  --username "$ADMIN_USERNAME" --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" || {
  echo "⚠ 管理员创建失败，可稍后手动执行：npm run create:admin";
}

if [ "${HTTPS:-0}" = "1" ]; then
  echo ""
  echo "🎉 部署完成："
  echo "   管理台 https://<服务器IP>/admin  （admin 账号登录）"
  echo "   主 App   https://<服务器IP>/"
  echo "   健康检查 https://<服务器IP>/api/v1/health"
else
  echo ""
  echo "🎉 部署完成（HTTP）："
  echo "   健康检查 http://<服务器IP>:3000/api/v1/health"
  echo "   管理台   http://<服务器IP>/admin  （admin 账号登录）"
  echo "   前端     http://<服务器IP>/"
fi
echo "   管理员   ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}"
if [ "${ADMIN_PASSWORD}" = "Admin@1234" ]; then
  echo "   ⚠ 正在使用默认管理员密码，请立即登录管理台修改！建议重跑：ADMIN_PASSWORD='<强密码>' ./deploy/deploy.sh"
fi
echo ""
echo "   PostgreSQL/Redis 数据在 volume 中；备份：npm run backup（需在 server 容器内执行）"
