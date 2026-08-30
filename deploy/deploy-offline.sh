#!/usr/bin/env bash
#
# KeelBase 离线/内网部署脚本（POV-3）
#
# 政企内网/离线环境：无外网无法 docker pull 镜像。本脚本假设镜像已预置到内网
# 仓库（或已 load），只做：
#   1. 校验关键镜像存在（内网仓库或本地已拉取）
#   2. 生成 .env.production（默认关外部依赖：SMTP/推送/OAuth/SMS → 全部降级）
#   3. 可选 HTTPS
#   4. 起容器 + 建管理员
#
# 预置镜像（需在可联网机器 `docker pull` 后 push 到内网仓库）：
#   pgvector/pgvector:pg17  redis:7-alpine  node:22-alpine  nginx:alpine
#   本基座镜像（build 产物）
#
# 用法：
#   IMAGE_REGISTRY=harbor.internal/base ./deploy/deploy-offline.sh

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="Server-NestJS/.env.production"
export NODE_ENV=production
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@2026\$KeelBase}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
REGISTRY="${IMAGE_REGISTRY:-}"

# ── 1. 前置检查 ──────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || { echo "✗ Docker 未安装"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "✗ Docker Compose v2 不可用"; exit 1; }

echo "✓ Docker 就绪"

# 关键镜像存在性（内网仓库前缀则替换 tag 引用；否则本地 load 后直接引用）
REQUIRED_IMAGES=( "pgvector/pgvector:pg17" "redis:7-alpine" "node:22-alpine" "nginx:alpine" )
for img in "${REQUIRED_IMAGES[@]}"; do
  check="${REGISTRY:+$REGISTRY/}${img}"
  if ! docker image inspect "$check" >/dev/null 2>&1 && ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "✗ 缺少镜像: $img"
    echo "  离线环境需预置：在可联网机器 docker pull 后，内网 load 或 push 到 $REGISTRY"
    exit 1
  fi
done
echo "✓ 关键镜像已就绪"

# ── 2. 生成生产 env（外部依赖全部降级 = 内网可用） ──────────
if [ ! -f "$ENV_FILE" ]; then
  cp "Server-NestJS/.env.production.example" "$ENV_FILE"
  gen() { openssl rand -hex 32; }
  DB_PASS=$(gen)
  sed -i.bak \
    -e "s/^JWT_SECRET=.*/JWT_SECRET=$(gen)/" \
    -e "s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$(gen)/" \
    -e "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$(gen)/" \
    -e "s/^DB_PASSWORD=.*/DB_PASSWORD=$DB_PASS/" \
    -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$DB_PASS/" \
    -e "s/^DB_NAME=.*/DB_NAME=front_production/" \
    "$ENV_FILE"
  rm -f "$ENV_FILE.bak"
  # 模板可能缺 ENCRYPTION_KEY/AUDIT_HMAC_KEY 行 → 追加缺失行（防配置校验失败）
  for KEY in ENCRYPTION_KEY AUDIT_HMAC_KEY; do
    grep -q "^${KEY}=" "$ENV_FILE" || echo "${KEY}=$(gen)" >> "$ENV_FILE"
  done
  # 内网默认降级：邮件/推送/短信/OAuth 全关（可后续手动开内网替代）
  cat >> "$ENV_FILE" <<'ENVEOF'

# ---- POV-3 内网降级（可手动开启内网替代）----
MAIL_ENABLED=false
PUSH_DRIVER=none
SMS_DRIVER=none
OAUTH_ENABLED_PROVIDERS=
ENVEOF
  echo "✓ 已生成 $ENV_FILE（外部依赖默认降级，适配内网）"
else
  echo "✓ 使用已有 $ENV_FILE"
fi

# ── 3. HTTPS（可选） ─────────────────────────────────────────
COMPOSE_FILES=(-f docker-compose.yml)
if [ "${HTTPS:-0}" = "1" ]; then
  mkdir -p certs
  if [ ! -f certs/server.crt ] || [ ! -f certs/server.key ]; then
    openssl req -x509 -nodes -newkey rsa:2048 \
      -keyout certs/server.key -out certs/server.crt \
      -days 365 -subj "/CN=localhost"
  fi
  COMPOSE_FILES+=(-f docker-compose.prod.yml)
fi

# ── 4. 起容器 + 建管理员 ────────────────────────────────────
docker compose "${COMPOSE_FILES[@]}" up -d
echo "→ 等待服务健康..."
for i in $(seq 1 30); do
  if docker compose "${COMPOSE_FILES[@]}" exec -T server wget -q --spider http://localhost:3000/api/v1/health 2>/dev/null; then
    echo "✓ 后端健康"; break
  fi
  sleep 2
done

docker compose "${COMPOSE_FILES[@]}" exec -T -e NODE_ENV=production server npx ts-node scripts/create-admin.ts \
  --username "$ADMIN_USERNAME" --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" || {
  echo "⚠ 管理员创建失败，稍后手动：npm run create:admin";
}

echo ""
echo "🎉 离线部署完成：${ADMIN_USERNAME} / ${ADMIN_PASSWORD}"
echo "   AI 走本地 Ollama（配置 OLLAMA_BASE_URL）或禁用（数据不出域）"
echo "   邮件/推送/短信已降级；内网替代可手动改 .env.production 后重启"
