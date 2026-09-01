#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# KeelBase 在线 Demo 演示站 —— AI CRM Golden Flow 一键体验（P0·产品证明）
#
# 一条命令起「AI CRM Golden Flow」演示。工作台（Web-Admin-Vue /admin）是 Web 业务 UI
# 唯一宿主（2026-08-17 端定位），AI CRM Copilot + 写操作确认 + 治理轨迹都在这里：
#   1. 构建 Web-Admin-Vue 工作台 → Server-NestJS/public/admin
#   2. 可选：复用 Flutter web 移动预览 → Server-NestJS/public/mobile
#   3. 启动后端（SERVE_STATIC=1 托管全部静态资源；空库首启自动种演示数据）
#   4. 打开 http://localhost:3000 → 自动进入工作台（/admin/#/workbench）
#
# 用法：
#   ./deploy/demo.sh                  # 本地演示站（默认 3000）
#   PORT=3000 ./deploy/demo.sh        # 指定端口
#   SKIP_MOBILE=1 ./deploy/demo.sh    # 跳过移动预览（未构建 Flutter web 时自动跳过）
#
# 公网部署演示站（域名/DNS/HTTPS/静态托管）见 docs/manual/demo-deploy.md；
# 单容器交付（工作台 + 管理台 + 移动预览，仅需 Docker）见 ./scripts/docker-single.sh

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
SERVER_DIR="Server-NestJS"
PUBLIC_DIR="$SERVER_DIR/public"

cleanup() {
  if [ -n "${BACKEND_PID:-}" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "→ [1/4] 构建 Web-Admin 工作台（AI CRM Golden Flow 载体，约 20s）..."
( cd Web-Admin-Vue && npm run build )
mkdir -p "$PUBLIC_DIR/admin"
rm -rf "$PUBLIC_DIR/admin"/*
cp -r Web-Admin-Vue/dist/admin/* "$PUBLIC_DIR/admin/"

if [ "${SKIP_MOBILE:-}" != "1" ] && [ -d Front-Flutter/build/web ]; then
  echo "→ [2/4] 复用 Flutter web 移动预览（/mobile）..."
  mkdir -p "$PUBLIC_DIR/mobile"
  rm -rf "$PUBLIC_DIR/mobile"/*
  cp -r Front-Flutter/build/web/* "$PUBLIC_DIR/mobile/"
else
  echo "→ [2/4] 跳过移动预览（Front-Flutter/build/web 不存在或 SKIP_MOBILE=1）"
fi

echo "→ [3/4] 启动后端（SERVE_STATIC=1 托管工作台/管理台/移动预览；空库首启自动种演示数据）..."
( cd "$SERVER_DIR" && SERVE_STATIC=1 PORT="$PORT" CACHE_ENABLED=false QUEUE_ENABLED=false npm run start:dev ) &
BACKEND_PID=$!

echo "→ 等待后端健康（http://localhost:$PORT/api/v1/health）..."
READY=0
for i in $(seq 1 60); do
  if curl -s -o /dev/null "http://localhost:$PORT/api/v1/health" 2>/dev/null; then
    READY=1
    echo "✓ 后端就绪"
    break
  fi
  sleep 1
done
if [ "$READY" != "1" ]; then
  echo "⚠ 后端未在 60s 内就绪，请查看 $SERVER_DIR 日志"
fi

echo "→ [4/4] 演示站已启动"
cat <<EOF

🎉 KeelBase AI CRM Golden Flow 一键演示就绪！

  工作台   http://localhost:$PORT            （自动进入 /admin/#/workbench）
  管理台   http://localhost:$PORT/admin
  移动预览 http://localhost:$PORT/mobile

  演示账号：
    普通用户  alex / Alex@2026\$Demo
    管理员    admin / Admin@2026\$KeelBase

  演示路径（60 秒）：
    1. 工作台进入「AI CRM」→ 客户列表
    2. AI 面板问「哪些客户本周最值得跟进？」
    3. AI 读数据 → 分析风险 → 建议创建跟进任务 → 人工确认
    4. 确认后自动打开治理轨迹（谁 / 何时 / 做了什么 / 为什么允许 / 审计）

  Ctrl+C 退出并停止后端
EOF
wait "$BACKEND_PID"
