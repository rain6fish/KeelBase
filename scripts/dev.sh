#!/usr/bin/env bash
#
# KeelBase 统一命令入口（Windows/Linux/Mac 通用，不依赖 make）
#
# 用法：./scripts/dev.sh <command>
#   experience      一键体验（起后端+管理台，自动开浏览器）
#   demo            一键起在线演示站（Taro H5 主 App + 后端种子数据，PM-1）
#   seed-demo       为演示用户补种演示数据（事件/待办/知识库/对话/通知）
#   healthcheck     运维健康巡检（服务/依赖/指标/本地资源/备份）
#   dev             本地开发起后端（热重载，SQLite 零配置）
#   dev-admin       构建并托管管理台
#   web             起 Flutter Web 主 App
#   test            全部测试（后端单测+e2e+前端）
#   test-backend    后端单测
#   test-frontend   Flutter 测试
#   lint            后端 lint
#   build           生产构建（Docker）
#   docker-up       Docker 一键起全部
#   migrate         执行数据库迁移
#   backup          数据库备份
#   db-redis        起 Redis
#   help            显示本帮助
#
# 等价于 Makefile 目标；无 make 的环境用本脚本。

set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

case "${1:-help}" in
  experience)
    ./deploy/experience.sh
    ;;
  demo)
    ./deploy/demo.sh
    ;;
  seed-demo)
    cd Server-NestJS && npm run seed:demo
    ;;
  healthcheck)
    cd Server-NestJS && npm run healthcheck
    ;;
  dev)
    cp -n Server-NestJS/.env.example Server-NestJS/.env 2>/dev/null || true
    echo "→ 本地开发起后端（SQLite 零配置；无需 Redis，已降级缓存/队列）"
    cd Server-NestJS && CACHE_ENABLED=false QUEUE_ENABLED=false npm run start:dev
    ;;
  dev-admin)
    cd Web-Admin-Vue && npm run dev
    ;;
  web)
    cd Front-Flutter && flutter run -d chrome
    ;;
  test)
    "$0" test-backend
    "$0" test-frontend
    ;;
  test-backend)
    cd Server-NestJS && npm test
    cd Server-NestJS && npm run test:e2e
    ;;
  test-frontend)
    cd Front-Flutter && flutter test
    ;;
  lint)
    cd Server-NestJS && npm run lint
    ;;
  build)
    docker compose build
    ;;
  docker-up)
    docker compose up --build -d
    echo "→ 主 App http://localhost  管理台 http://localhost/admin  健康 http://localhost:3000/api/v1/health"
    ;;
  migrate)
    cd Server-NestJS && npm run migration:run
    ;;
  backup)
    cd Server-NestJS && npm run backup
    ;;
  db-redis)
    docker compose up redis -d
    ;;
  help|*)
    sed -n 's/^#   \([a-z-]*\)[[:space:]]*\(.*\)/  \1  \2/p' "$0"
    echo ""
    echo "用法：./scripts/dev.sh <command>"
    ;;
esac
