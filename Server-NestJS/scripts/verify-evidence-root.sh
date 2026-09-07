#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# KB-3 证据根一键复现（公开可复现验证程序）：隔离后端 → trust-proof S1-S7
# （含 S7 证据根导出 v3 → 离线验证 PASS → 篡改检测 FAIL），跑一次即产出可离线复核的证据包。
#
# 自包含：在自己端口起一个隔离后端（fresh sqlite + development 自动建 alex/admin + demo provider），
# 跑完即停，不影响宿主机 3000 上已有的开发后端。全程确定性（无 LLM）。
#
# 用法：
#   cd Server-NestJS && npm run verify:evidence-root
#   # 或：BENCH_PORT=3299 bash scripts/verify-evidence-root.sh
#
# 输出：docs/benchmark/evidence-root-<ts>.json（v3 证据包，可离线复核）
#       + verify-evidence 自动报告 evidence-verify-<ts>.md/.json + trust-proof-<ts>.json
# 复核：node scripts/verify-evidence.mjs docs/benchmark/evidence-root-<ts>.json --key <AUDIT_HMAC_KEY>
# 退出码 0 = 全过（含篡改被检出）。

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${BENCH_PORT:-3199}"
BASE="http://localhost:${PORT}/api/v1"
REPORT_DIR="docs/benchmark"
SERVER_LOG="$REPORT_DIR/evidence-root-server.log"
mkdir -p "$REPORT_DIR"

# 固定测试密钥（64 hex）——仅隔离 demo 用；生产密钥自定
KEY_FIX="$(printf '%s' 'keelbase-evidence-root-demo-key' | sha256sum | cut -d' ' -f1)"

echo "═══ KB-3 证据根一键复现（隔离后端 + demo provider，确定性）═══"
echo "目标 $BASE | AUDIT_HMAC_KEY=固定测试密钥（64hex 前缀 ${KEY_FIX:0:8}…）"
echo ""

# ── 编译 ──────────────────────────────────────────────────────────────────────
echo "→ build"
if ! npm run build >/dev/null 2>&1; then
  echo "  ✗ 后端编译失败" >&2
  exit 1
fi
echo "  ✓ 编译通过"

# ── 起隔离后端（fresh sqlite + development 自动种 alex/admin）────────────────
rm -f data/evidence.sqlite
export NODE_ENV=development
export PORT=$PORT
export DB_PATH=./data/evidence.sqlite
export JWT_SECRET="$(openssl rand -hex 32)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export ENCRYPTION_KEY="$KEY_FIX"
export ENCRYPTION_HMAC_KEY="$KEY_FIX"
export AUDIT_HMAC_KEY="$KEY_FIX"
# demo provider 由内部无条件注册（无云 key/OLLAMA 时），不入 AI_PROVIDER（env Joi 仅允许 deepseek 等）
export QUEUE_ENABLED=false
export CACHE_ENABLED=false

(node dist/main > "$SERVER_LOG" 2>&1) &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

echo "→ 等待后端就绪"
for i in $(seq 1 90); do
  if curl -s -m 2 "$BASE/health" >/dev/null 2>&1; then break; fi
  if [ "$i" = "90" ]; then
    echo "  ✗ 后端 90s 未就绪（日志尾）：" >&2
    tail -30 "$SERVER_LOG" >&2
    exit 1
  fi
  sleep 1
done
echo "  ✓ 就绪（$BASE）"

# ── trust-proof S1-S7（含证据根导出 + 离线验证 + 篡改检测）────────────────────
echo "→ trust-proof S1-S7（确定性 demo provider；S7 = 证据根 v3 一键验证）"
if BASE_URL="$BASE" PROVIDER=demo AUDIT_HMAC_KEY="$KEY_FIX" node scripts/verify-trust-proof.mjs; then
  echo "  ✓ trust-proof 全过（含 S7 证据根离线验证 PASS + 篡改检测 FAIL）"
else
  echo "  ✗ trust-proof 有 fail（逐场景见上方输出 / trust-proof-*.json）" >&2
  exit 1
fi

echo ""
echo "═══ 完成：证据包见 docs/benchmark/evidence-root-<ts>.json（可用 verify-evidence.mjs --key 复核）═══"
