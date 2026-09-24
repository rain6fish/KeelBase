#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# Full 剖面合规门禁（CE-1③ / JV-13 L0 判据的常绿化）
#
# 判据 docs/protocols/conformance-profile.md §2.2 Full（F4 wire 形状 + F5 前端契约面）此前只有
# 一次性跑过：JV-13 用 verify-full-profile.mjs 量出 Java 距 Full 多远，但没有任何门禁守着这个
# 判据本身。本脚本把它变成常绿——起隔离后端（fresh sqlite + 确定性 env，不碰宿主机 3000 的
# 开发后端）→ 跑 runner → 停后端 → 透传退出码。
#
# runner 本体住在契约仓（所钉的 submodule 里），本仓不再自持副本；`--out` 显式指回本仓的
# docs/benchmark/，报告位置与过去一致。
#
# 为什么值得单独一条门禁：F4/F5 是「同一套前端接第二个 Runtime」的前提（Rev-8 触发条件②）。
# 参考实现一旦让信封或能力面漂移，受损的不是它自己，而是**所有**指向它的前端与第二载体。
#
# 用法：
#   cd Server-NestJS && npm run verify:full-profile
#   # 或：FULL_PROFILE_PORT=3401 bash scripts/proof-full-profile.sh
# 输出：docs/benchmark/full-profile-<label>-<ts>.{json,md}（含缺口表）
# 退出码：0 = 无缺口；1 = 有缺口（红即诊断，缺口表里逐条列明）

set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BE="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${FULL_PROFILE_PORT:-3401}"
BASE="http://localhost:${PORT}"
REPORT_DIR="$BE/docs/benchmark"
SERVER_LOG="$REPORT_DIR/full-profile-server.log"
mkdir -p "$REPORT_DIR"

# 确定性密钥（本门禁不碰真实数据，只为满足启动期 env 校验）
KEY_FIX="$(printf '%s' 'keelbase-full-profile-gate' | sha256sum | cut -d' ' -f1)"

SERVER_PID=""
# 可靠停后端：先 TERM，再等，仍存活则按平台强制结束
# （git-bash 的 kill 对原生 node 子进程常无效，会遗留占用 sqlite 与端口）
stop_server() {
  [ -n "$SERVER_PID" ] || return 0
  kill "$SERVER_PID" 2>/dev/null || true
  for i in 1 2 3 4 5; do
    kill -0 "$SERVER_PID" 2>/dev/null || { SERVER_PID=""; return 0; }
    sleep 1
  done
  case "$(uname -s 2>/dev/null)" in
    *MINGW*|*MSYS*|*CYGWIN*) taskkill //PID "$SERVER_PID" //F >/dev/null 2>&1 || true ;;
    *) kill -9 "$SERVER_PID" 2>/dev/null || true ;;
  esac
  SERVER_PID=""
}
cleanup() {
  stop_server
  for i in 1 2 3; do rm -f "$BE/data/full-profile.sqlite" 2>/dev/null && break; sleep 1; done
}
trap cleanup EXIT

echo "═══ Full 剖面合规门禁（F4 + F5）═══"
echo "BASE=$BASE | 判据=conformance-profile §2.2 Full"
echo ""

echo "→ build"
if ! (cd "$BE" && npm run build >/dev/null 2>>"$SERVER_LOG"); then
  echo "✗ 后端编译失败（tail $SERVER_LOG）"
  tail -20 "$SERVER_LOG"
  exit 1
fi
echo "  ✓ 编译通过"

rm -f "$BE/data/full-profile.sqlite"
export NODE_ENV=development PORT=$PORT DB_PATH=./data/full-profile.sqlite
export JWT_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export ENCRYPTION_KEY="$KEY_FIX" ENCRYPTION_HMAC_KEY="$KEY_FIX" AUDIT_HMAC_KEY="$KEY_FIX"
export QUEUE_ENABLED=false CACHE_ENABLED=false
(cd "$BE" && exec node dist/main >"$SERVER_LOG" 2>&1) &
SERVER_PID=$!

echo "→ 等待后端就绪（$BASE/api/v1/health）"
READY=0
for i in $(seq 1 120); do
  if curl -s -m 2 "$BASE/api/v1/health" >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
if [ "$READY" != "1" ]; then
  echo "✗ 后端 120s 未就绪（日志尾）:"
  tail -20 "$SERVER_LOG"
  exit 1
fi
echo "  ✓ 就绪"

echo "→ verify-full-profile（F4 信封/错误形状 + F5 两端点）"
(cd "$BE" && node specs/protocol/runner/verify-full-profile.mjs --base-url "$BASE" --label ci --out "$REPORT_DIR")
STATUS=$?

stop_server

if [ "$STATUS" != "0" ]; then
  echo ""
  echo "✗ Full 剖面有缺口（退出码 $STATUS）——缺口表见 docs/benchmark/full-profile-ci-*.md"
  exit 1
fi
echo ""
echo "✓ Full 剖面无缺口"
exit 0
