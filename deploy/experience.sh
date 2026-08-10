#!/usr/bin/env bash
#
# ShiYu-AppBase 一键体验脚本（傻瓜化）
#
# 目标：一条命令让零基础用户跑起来，不用看文档。
# 默认「本地开发模式」（零依赖，SQLite 免配），可选 Docker 模式。
#
# 用法：
#   ./deploy/experience.sh               # 本地模式：后端 + 管理台
#   DOCKER=1 ./deploy/experience.sh      # Docker 模式：一键起全部
#
# 结束时打印演示账号与访问地址。

set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

echo "==============================================="
echo "  ShiYu-AppBase 一键体验"
echo "==============================================="

# ── Docker 模式：最简单，只需 Docker ───────────────────────
if [ "${DOCKER:-0}" = "1" ]; then
  command -v docker >/dev/null 2>&1 || { echo "✗ 需要 Docker。安装: https://www.docker.com/products/docker-desktop/"; exit 1; }
  echo "→ 用 Docker 一键起服务（首次构建约 10 分钟）..."
  docker compose up --build -d
  echo "→ 等待后端就绪..."
  for i in $(seq 1 60); do
    if curl -sf http://localhost:3000/api/v1/health >/dev/null 2>&1; then
      break
    fi
    sleep 3
  done
  cat <<'EOF'

🎉 全部启动完成！

  主 App    http://localhost
  后端 API  http://localhost:3000  （Swagger: /api/docs）
  健康检查  http://localhost:3000/api/v1/health

  演示账号：
    普通用户  alex / 123456
    管理员    admin / Admin@1234 （管理台 http://localhost/admin 需自行部署管理台）

  停止：docker compose down
EOF
  exit 0
fi

# ── 本地开发模式 ───────────────────────────────────────────
# 检查 Node
command -v node >/dev/null 2>&1 || { echo "✗ 未找到 Node.js。安装: https://nodejs.org/ (≥22)"; exit 1; }
NODE_VER=$(node -v)
echo "✓ Node ${NODE_VER}"

# 1. 后端
echo ""
echo "→ 启动后端（SQLite 零配置，首次自动建演示账号）..."
if [ ! -f Server-Nodejs/.env ]; then
  cp Server-Nodejs/.env.example Server-Nodejs/.env
  echo "  ✓ 已生成 .env"
fi
if [ ! -d Server-Nodejs/node_modules ]; then
  echo "→ 安装后端依赖（首次需几分钟）..."
  (cd Server-Nodejs && npm install)
fi

# 后台起后端，日志写文件。
# 降级缓存/队列（CACHE_ENABLED/QUEUE_ENABLED=false）：本地无需 Redis 即可跑通；
# 需要缓存/队列时先 `docker compose up redis -d` 再去掉这两个前缀。
(cd Server-Nodejs && CACHE_ENABLED=false QUEUE_ENABLED=false npm run start:dev > "$ROOT/.experience-backend.log" 2>&1) &
BACKEND_PID=$!

echo "→ 等待后端就绪..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/v1/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! curl -sf http://localhost:3000/api/v1/health >/dev/null 2>&1; then
  echo "✗ 后端启动超时。日志：.experience-backend.log"
  exit 1
fi
echo "✓ 后端就绪 (PID $BACKEND_PID)"

# 2. 管理台（可选，构建静态产物 + 静态服务器）
ADMIN_PORT="${ADMIN_PORT:-10086}"
if command -v python >/dev/null 2>&1; then
  if [ ! -d Front-Taro-Admin/node_modules ]; then
    echo "→ 安装管理台依赖（首次需几分钟）..."
    (cd Front-Taro-Admin && npm install)
  fi
  echo "→ 构建管理台..."
  (cd Front-Taro-Admin && npm run build:h5 > "$ROOT/.experience-admin-build.log" 2>&1)
  (python -m http.server "$ADMIN_PORT" -d Front-Taro-Admin/dist > "$ROOT/.experience-admin.log" 2>&1) &
  ADMIN_PID=$!
  ADMIN_URL="http://localhost:$ADMIN_PORT"
else
  echo "⚠ 未找到 python，跳过管理台。可自行用任意静态服务器托管 Front-Taro-Admin/dist"
  ADMIN_URL="（未启动）"
fi

cat <<EOF

🎉 体验环境就绪！

  后端 API   http://localhost:3000  （Swagger: /api/docs）
  管理台     $ADMIN_URL

  演示账号：
    普通用户  alex / 123456     → 主 App 用（Flutter 需另起，或访问 Swagger）
    管理员    admin / Admin@1234 → 管理台登录

  停止：kill $BACKEND_PID ${ADMIN_PID:-}   （或关终端）
  后端日志：.experience-backend.log

  体验 AI：先配 LLM Key（Server-Nodejs/.env 的 DEEPSEEK_API_KEY），
  或用本地 Ollama（见 docs/manual/quickstart.md）
EOF
