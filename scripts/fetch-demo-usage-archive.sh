#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# KeelBase Demo 用量归档拉取（ECS → 本机）
#
# 把 demo 环境上「初始化前归档」的用量快照拉回本机供分析。
# 配套脚本：scripts/archive-demo-usage.py（在 ECS 上被 reset-test-data.sh 于重置前调用）。
#
# ECS 侧只保留最近 3 份（见归档脚本 --keep），本机保留全部，
# 所以要定期运行本脚本，否则 ECS 上被轮转掉的归档将永久丢失。
#
# 用法：
#   ./scripts/fetch-demo-usage-archive.sh
#   ./scripts/fetch-demo-usage-archive.sh --key ~/.ssh/id_ed25519 --dest /d/usage-archive
#
# 可用环境变量（等价于同名参数，参数优先）：
#   ECS_HOST            默认 root@121.199.30.80
#   ECS_SSH_KEY         默认空（走 ssh 默认身份 / agent）
#   USAGE_ARCHIVE_DEST  默认 $HOME/keelbase-usage-archive
#
# 只拉取本机尚不存在的归档目录，已存在的跳过，可反复安全运行。

set -euo pipefail

HOST="${ECS_HOST:-root@121.199.30.80}"
SSH_KEY="${ECS_SSH_KEY:-}"
DEST="${USAGE_ARCHIVE_DEST:-$HOME/keelbase-usage-archive}"
REMOTE_DIR="/opt/keelbase/usage-archive"

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --key) SSH_KEY="$2"; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    --remote-dir) REMOTE_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "未知参数：$1（--host / --key / --dest / --remote-dir）" >&2; exit 1 ;;
  esac
done

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
if [ -n "$SSH_KEY" ]; then
  SSH_OPTS+=(-i "$SSH_KEY")
fi

echo "→ 读取 $HOST:$REMOTE_DIR"
remote_dirs="$(ssh "${SSH_OPTS[@]}" "$HOST" "ls -1d $REMOTE_DIR/*/ 2>/dev/null | xargs -n1 basename" || true)"
if [ -z "$remote_dirs" ]; then
  echo "· 远端暂无归档（或目录不存在）"
  exit 0
fi

mkdir -p "$DEST"
pulled=0
for d in $remote_dirs; do
  if [ -d "$DEST/$d" ]; then
    echo "· 已存在，跳过：$d"
    continue
  fi
  echo "→ 拉取 $d"
  scp "${SSH_OPTS[@]}" -q -r "$HOST:$REMOTE_DIR/$d" "$DEST/"
  pulled=$((pulled + 1))
done

echo
echo "════ 拉取完成：本次 $pulled 份，本地共 $(ls -1d "$DEST"/*/ 2>/dev/null | wc -l | tr -d ' ') 份 ════"
echo "本地位置：$DEST"
