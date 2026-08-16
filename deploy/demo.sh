#!/usr/bin/env bash
#
# KeelBase 在线 Demo 演示站（PM-1）
#
# 一键起「只读体验站」：
#   1. 构建 Taro H5 主 App（build:h5，API base 默认 http://localhost:3000/api/v1，跨域由 dev CORS 放行）
#   2. 启动后端（开发模式；空库首启自动种入演示数据 —— alx/123456、admin/Admin@1234）
#   3. 静态托管 Taro 产物到 http://localhost:8080
#
# 用法：
#   ./deploy/demo.sh                  # 本地演示站（默认 8080）
#   PORT=8081 ./deploy/demo.sh        # 指定端口
#   API_BASE=https://api.example.com/api/v1 ./deploy/demo.sh   # 指定后端 API 基址
#
# 公网部署演示站（域名/DNS/HTTPS/静态托管）见 docs/manual/demo-deploy.md

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8080}"
API_BASE="${API_BASE:-http://localhost:3000/api/v1}"

cleanup() {
  if [ -n "${BACKEND_PID:-}" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "→ [1/3] 构建 Taro H5 主 App（API base: $API_BASE）..."
( cd Front-Taro && TARO_APP_API_BASE="$API_BASE" npm run build:h5 )

echo "→ [2/3] 启动后端（开发模式；空库首启自动种演示数据）..."
( cd Server-NestJS && CACHE_ENABLED=false QUEUE_ENABLED=false npm run start:dev ) &
BACKEND_PID=$!

echo "→ 等待后端健康（http://localhost:3000/api/v1/health）..."
READY=0
for i in $(seq 1 40); do
  if curl -s -o /dev/null "http://localhost:3000/api/v1/health" 2>/dev/null; then
    READY=1
    echo "✓ 后端就绪"
    break
  fi
  sleep 1
done
if [ "$READY" != "1" ]; then
  echo "⚠ 后端未在 40s 内就绪，请查看 Server-NestJS 日志"
fi

echo "→ [3/3] 托管 Taro H5 产物 → http://localhost:${PORT}"
echo "  主 App   http://localhost:${PORT}   （演示账号 alex / 123456）"
echo "  管理台   http://localhost:3000/admin （admin / Admin@1234）"
echo "  Ctrl+C 退出并停止后端"
( cd Front-Taro/dist && npx --yes serve -l "$PORT" )
