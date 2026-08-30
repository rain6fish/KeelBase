#!/usr/bin/env bash
# KeelBase Demo Reset（V-4：数据一键复位）
#
# 复位 = 备份当前库 → 删除数据库 → 重启后端自动重种演示数据（空库首启自动 seed，见 src/common/seed.ts）。
# 本地开发与容器（ECS）部署双模式；默认安全备份到 data/backups/（保留最近 7 份，与 npm run backup 一致）。
#
# 用法：
#   ./scripts/reset-demo.sh               # 本地开发复位（请先停后端，脚本会检测并提示）
#   ./scripts/reset-demo.sh --no-backup   # 跳过备份（确认后）
#   ./scripts/reset-demo.sh --docker      # 容器部署复位（在 docker compose 项目目录运行）
#
# 复位后：
#   本地：重新 npm run start:dev（或 start）→ 空库首启自动 seed 演示数据
#   容器：docker compose up -d --force-recreate server → 同上

set -euo pipefail

MODE="local"
DO_BACKUP=1
for arg in "$@"; do
  case "$arg" in
    --docker) MODE="docker" ;;
    --no-backup) DO_BACKUP=0 ;;
    -h|--help)
      sed -n '1,20p' "$0"; exit 0 ;;
    *) echo "未知参数：$arg（--docker / --no-backup）"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/../Server-NestJS/data/backups"

# DB 路径可经 env 覆盖（默认对应当前 .env 的 DB_PATH / GOVERNANCE_DB_PATH）
DB_FILE="${DB_FILE:-$SCRIPT_DIR/../Server-NestJS/data/front.sqlite}"
GOV_DB_FILE="${GOV_DB_FILE:-$SCRIPT_DIR/../Server-NestJS/data/governance.sqlite}"
DB_FILES=("$DB_FILE" "$GOV_DB_FILE")

if [ "$MODE" = "docker" ]; then
  echo "→ 容器模式：将在 docker compose 的 server 容器内复位（server-data volume）"
  echo "  先停 server 再删库（容器内 WAL 需无并发写）："
  docker compose stop server
  DB_FILES=()
  echo "  （容器内库文件在 server-data volume，见 demo-deploy.md 复位一节）"
fi

# 0. 本地模式：检测后端是否在跑（3000 端口）——在跑则提示先停，避免 WAL/占用删除失败
if [ "$MODE" = "local" ]; then
  if netstat -ano 2>/dev/null | grep -q ":3000 .*LISTEN"; then
    echo "⚠  检测到后端正在 :3000 监听——请先停止后端再复位（运行中删库会失败或产生损坏库）。"
    exit 1
  fi
  if curl -s -o /dev/null -m 2 http://localhost:3000/api/v1/health 2>/dev/null; then
    echo "⚠  后端 /health 可达（可能跑在非 3000 端口）——请先停止后端再复位。"
    exit 1
  fi
fi

# 1. 备份（本地模式）：脚本要求后端已停——停库状态无并发写、WAL 已 checkpoint，直接 cp 安全可靠
for db in "${DB_FILES[@]}"; do
  if [ ! -f "$db" ]; then
    echo "  · 跳过（不存在）：$db"
    continue
  fi
  if [ "$DO_BACKUP" = "1" ]; then
    mkdir -p "$BACKUP_DIR"
    stamp="$(date +%Y%m%d-%H%M%S)"
    out="$BACKUP_DIR/$(basename "$db" .sqlite)-$stamp.backup"
    cp "$db" "$out"
    echo "  → 已备份 $db → $out（$(du -h "$out" | cut -f1)）"
  else
    echo "  · 跳过备份（--no-backup）：$db"
  fi
done

# 2. 删除数据库（含 WAL/SHM 残留）
for db in "${DB_FILES[@]}"; do
  rm -f "$db" "$db-wal" "$db-shm"
  echo "  · 已删除：$db"
done

# 3. 保留最近 7 份备份（与 BACKUP_KEEP 对齐）
if [ "$DO_BACKUP" = "1" ] && [ -d "$BACKUP_DIR" ]; then
  ls -1t "$BACKUP_DIR"/*.backup 2>/dev/null | tail -n +8 | xargs -r rm -f
fi

echo
echo "════ 复位完成 ════"
if [ "$MODE" = "docker" ]; then
  echo "重启 server 自动重种演示数据：docker compose up -d --force-recreate server"
  echo "（演示账号 alex / Alex@2026\$Demo、admin / Admin@2026\$KeelBase 会自动重建）"
else
  echo "重启后端自动重种演示数据："
  echo "  cd Server-NestJS && npm run start:dev"
  echo "（或首次启动会自动 seed；演示账号 alex / Alex@2026\$Demo、admin / Admin@2026\$KeelBase）"
fi
