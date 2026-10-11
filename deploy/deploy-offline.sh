#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
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
#   pgvector/pgvector:pg17  redis:7-alpine  node:22-alpine  alpine:3.24
#   本基座镜像（build 产物）
#
# ⚠ 2026-09-26：web 基座由官方 `nginx:alpine` 换成 `alpine:3.24` + `apk add nginx nginx-mod-http-brotli`
#   （为了上 brotli，见 Dockerfile web 阶段）。**因此离线环境除了预置 `alpine:3.24`，还必须有那两个
#   apk 包**——`apk add` 需要软件源。最稳的离线做法是**别在内网 build web 镜像**，直接在有网机器上
#   `docker build` 好后 `docker save` 本基座镜像、到内网 `docker load`（本脚本本来就是按这个假设写的）。
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
REQUIRED_IMAGES=( "pgvector/pgvector:pg17" "redis:7-alpine" "node:22-alpine" "alpine:3.24" )
for img in "${REQUIRED_IMAGES[@]}"; do
  check="${REGISTRY:+$REGISTRY/}${img}"
  if ! docker image inspect "$check" >/dev/null 2>&1 && ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "✗ 缺少镜像: $img"
    echo "  离线环境需预置：在可联网机器 docker pull 后，内网 load 或 push 到 $REGISTRY"
    exit 1
  fi
done
echo "✓ 关键镜像已就绪"

# ── 2. 生成 / 校验生产 env（外部依赖全部降级 = 内网可用） ────
gen() { openssl rand -hex 32; }

# 关键密钥：空值、或仍与模板相同（占位符）都算「没配」——内网部署不该带着 change-me 上线。
# critical keys: empty, or still equal to the template's placeholder, counts as unset.
CRITICAL_KEYS=( JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY AUDIT_HMAC_KEY DB_PASSWORD POSTGRES_PASSWORD )
EXAMPLE_FILE="Server-NestJS/.env.production.example"

is_placeholder() {
  local key="$1" cur tpl
  cur=$(grep -m1 "^${key}=" "$ENV_FILE" | cut -d= -f2-)
  tpl=$(grep -m1 "^${key}=" "$EXAMPLE_FILE" | cut -d= -f2-)
  [ -z "$cur" ] || [ "$cur" = "$tpl" ]
}

# 离线降级键：**只补缺的**，不覆盖运维已经设过的值（例如已开的内网 SMTP）。
# offline degradation: append only the keys that are absent; never overwrite a value already set.
append_degradation() {
  local added=0
  while IFS='=' read -r k v; do
    if ! grep -q "^${k}=" "$ENV_FILE"; then
      [ "$added" = 0 ] && printf '\n# ---- POV-3 内网降级（可手动开启内网替代）----\n' >> "$ENV_FILE"
      echo "${k}=${v}" >> "$ENV_FILE"
      added=1
    fi
  done <<'ENVEOF'
MAIL_ENABLED=false
PUSH_DRIVER=none
SMS_DRIVER=none
OAUTH_ENABLED_PROVIDERS=
ENVEOF
  [ "$added" = 1 ] && echo "✓ 已补齐离线降级键（MAIL / PUSH / SMS / OAUTH）"
  return 0
}

if [ ! -f "$ENV_FILE" ]; then
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  DB_PASS=$(gen)
  sed -i.bak \
    -e "s/^JWT_SECRET=.*/JWT_SECRET=$(gen)/" \
    -e "s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$(gen)/" \
    -e "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$(gen)/" \
    -e "s/^AUDIT_HMAC_KEY=.*/AUDIT_HMAC_KEY=$(gen)/" \
    -e "s/^DB_PASSWORD=.*/DB_PASSWORD=$DB_PASS/" \
    -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$DB_PASS/" \
    -e "s/^DB_NAME=.*/DB_NAME=front_production/" \
    "$ENV_FILE"
  rm -f "$ENV_FILE.bak"
  # ⚠ 上面的 sed 只改**存在**的键；模板缺行会漏掉 ⇒ 这里按「缺行才补」兜住。
  #   反过来不成立：模板里**带着占位符的行**永远不会被这个循环碰到——那正是 2026-10-11 实跑
  #   逮到 `AUDIT_HMAC_KEY` 整份漏生成的原因（审计链的 HMAC 密钥一直是个已知常量）。
  # sed only rewrites keys that exist; the loop below appends only the absent ones. A key that
  # the template ships as a placeholder matches neither, which is how AUDIT_HMAC_KEY slipped.
  for KEY in JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY AUDIT_HMAC_KEY; do
    grep -q "^${KEY}=" "$ENV_FILE" || echo "${KEY}=$(gen)" >> "$ENV_FILE"
  done
  echo "✓ 已生成 $ENV_FILE（随机密钥，外部依赖默认降级）"
else
  # ⚠ 文件已存在 ≠ 可以直接用。2026-10-11 的 P1-11 实跑发现：旧文件会让这一步**静默**跳过
  # 密钥生成与降级，实例于是带着模板占位符（change-me-… / 0123456789abcdef…）上线。
  # An existing file is not automatically usable: a real run on 2026-10-11 showed the old
  # branch silently skipped both, shipping template placeholders. So: validate, then continue.
  MISSING=()
  for KEY in "${CRITICAL_KEYS[@]}"; do is_placeholder "$KEY" && MISSING+=("$KEY"); done
  if [ "${#MISSING[@]}" -gt 0 ]; then
    echo "✗ $ENV_FILE 里这些关键密钥是空的、或仍是模板占位符："
    printf '    %s\n' "${MISSING[@]}"
    echo "  内网部署不应用 change-me / 0123456789abcdef 这类占位符上线。二选一："
    echo "    · 全新部署：把该文件改名或删除后重跑本脚本（会生成随机密钥）"
    echo "    · 沿用现有配置：把上面这些键填成真实随机值（openssl rand -hex 32）"
    exit 1
  fi
  echo "✓ 已有 $ENV_FILE，关键密钥均非占位符"
fi

# 兜底：无论走哪一支，都不许带着占位符继续启动。2026-10-11 的实跑里，生成分支整份漏掉了
# `AUDIT_HMAC_KEY`，而当时**没有任何东西会响** —— 这条断言就是让同类缺陷下次一定响。
# Backstop for both branches: never start on a placeholder; the 2026-10-11 run showed the
# generation branch could omit one silently.
STILL=()
for KEY in "${CRITICAL_KEYS[@]}"; do is_placeholder "$KEY" && STILL+=("$KEY"); done
if [ "${#STILL[@]}" -gt 0 ]; then
  echo "✗ 生成/校验之后这些键仍是占位符：${STILL[*]}"
  echo "  这不该发生（本脚本自身的缺陷）——请连同上面的输出一起上报。"
  exit 1
fi

append_degradation

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
