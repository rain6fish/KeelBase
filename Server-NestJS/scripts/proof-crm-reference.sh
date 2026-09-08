#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# Protocol × Trust Proof Card — CRM Reference Application（internal-roadmap §internal.7 T3）
#
# 三轨合一，全部确定性（demo provider，无 LLM）：
#   G 生成轨：MUT=leads（specs/leads.json，CRM 级双 enum 生成模块）→ 委托 proof-protocol-trust.sh
#             跑全链（R4 生成 / R5 运行 / R6 治理元数据 / R7 确认 / R8 evidence / R9 撤销 / R10 重跑）→ card 1
#   F 旗舰轨：隔离后端跑 verify-trust-proof.mjs S1-S7（CRM 手写旗舰深度治理：
#             风险分析 / R5 删除阻断 / 写确认 / 撤销 crm_task / evidence-root）
#   留档：跑完由产物汇成 protocol-trust-card-crm-<ts>.md（三证明显式化，另写）
#
# 用法：
#   cd Server-NestJS && npm run verify:protocol-trust:crm
#   # 或：EXECUTOR=github_id BENCH_PORT=3419 bash scripts/proof-crm-reference.sh
# 环境：EXECUTOR=<github_id>（记 R2 有效 stranger，缺省=作者自跑/内部预跑）
# 输出：Server-NestJS/docs/benchmark/protocol-trust-card-<ts>.md（生成轨）+ trust-proof-<ts>.json（旗舰轨）
# 退出码：0 = 生成轨无红 且 旗舰轨 S1-S5/S7 全过；1 = 有红/失败

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BE="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$(cd "$BE/.." && pwd)"
PORT="${BENCH_PORT:-3419}"
BASE="http://localhost:${PORT}/api/v1"
REPORT_DIR="$BE/docs/benchmark"
mkdir -p "$REPORT_DIR"
EXECUTOR="${EXECUTOR:-}"

KEY_FIX="$(printf '%s' 'keelbase-crm-reference-demo-key' | sha256sum | cut -d' ' -f1)"
TS="$(date +%Y-%m-%dT%H-%M-%S-UTC)"
echo "═══ Protocol×Trust CRM Reference（T3，MUT=leads 生成轨 + AI CRM 旗舰轨）═══"
echo "base=$BASE | executor=${EXECUTOR:-作者自跑（内部预跑）}"

# ── G 生成轨：leads（CRM 级双 enum）走标准卡 ────────────────────────────────
echo ""
echo "── [G] 生成轨：leads（specs/leads.json）→ proof-protocol-trust.sh ──"
GEN_PORT=$((PORT - 20)) # 避免与后续旗舰轨同端（proof 脚本默认 3399，用独立端口）
if ! (cd "$BE" && MUT_SPEC="specs/leads.json" BENCH_PORT="$GEN_PORT" bash scripts/proof-protocol-trust.sh); then
  echo "  ✗ 生成轨（leads）有红行或失败" >&2
fi
CARD_G="$(ls -t "$REPORT_DIR"/protocol-trust-card-*.md 2>/dev/null | head -1)"
echo "  ✓ 生成轨记分卡：$CARD_G"
GEN_REDS=$(grep -cE '\| red \|' "$CARD_G" 2>/dev/null || echo 0)
[ -z "$GEN_REDS" ] && GEN_REDS=0

# ── F 旗舰轨：AI CRM 手写旗舰深度治理（trust-proof S1-S5/S7）──────────────
echo ""
echo "── [F] 旗舰轨：AI CRM 手写旗舰（verify-trust-proof S1-S7）──"
rm -f "$BE/data/crm-reference.sqlite"
export NODE_ENV=development PORT=$PORT DB_PATH=./data/crm-reference.sqlite
export JWT_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export ENCRYPTION_KEY="$KEY_FIX" ENCRYPTION_HMAC_KEY="$KEY_FIX" AUDIT_HMAC_KEY="$KEY_FIX"
export QUEUE_ENABLED=false CACHE_ENABLED=false
(cd "$BE" && exec node dist/main >"$REPORT_DIR/crm-reference-server.log" 2>&1) &
SERVER_PID=$!
stop_server() {
  [ -n "${SERVER_PID:-}" ] || return 0
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
cleanup() { stop_server; rm -f "$BE/data/crm-reference.sqlite" 2>/dev/null || true; }
trap cleanup EXIT

echo "→ 等待后端就绪（$BASE）"
for i in $(seq 1 120); do
  curl -s -m 2 "$BASE/health" >/dev/null 2>&1 && break
  [ "$i" = "120" ] && { echo "  ✗ 后端 120s 未就绪（日志尾）:"; tail -20 "$REPORT_DIR/crm-reference-server.log"; exit 1; }
  sleep 1
done
echo "  ✓ 就绪"

TRUST_OUT="$REPORT_DIR/crm-reference-trust-proof.txt"
(cd "$BE" && BASE_URL="$BASE" PROVIDER=demo AUDIT_HMAC_KEY="$KEY_FIX" \
  node scripts/verify-trust-proof.mjs >"$TRUST_OUT" 2>&1)
TRUST_STATUS=$?
echo "── trust-proof S1-S7 输出（节选）──"
grep -E '✓|✗|S[1-7]' "$TRUST_OUT" | head -30
echo "  trust-proof exit=$TRUST_STATUS"
TRUST_PKG="$(ls -t "$REPORT_DIR"/trust-proof-*.json 2>/dev/null | head -1)"
echo "  ✓ 旗舰轨留档：$TRUST_PKG"
stop_server

echo ""
echo "═══ CRM Reference 汇总：生成轨红=$GEN_REDS | 旗舰轨 exit=$TRUST_STATUS ═══"
echo "产物：$CARD_G / $TRUST_PKG（留档 doc 由后续据实撰写）"
# 退出码须并入生成轨红数（此前只按旗舰轨判，误导）
if [ "${GEN_REDS:-1}" != "0" ] || [ "$TRUST_STATUS" != "0" ]; then exit 1; else exit 0; fi
