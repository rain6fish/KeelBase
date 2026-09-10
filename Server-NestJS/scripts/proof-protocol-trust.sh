#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# Protocol × Trust Proof Card — 一键编排（internal-roadmap §internal.7 T2，规格 docs/protocol-trust-proof-card.spec.md）
#
# 陌生人可复现：生成 MUT（默认 invoices，specs/invoices.json）→ 编译进后端 → 起隔离后端
# （fresh sqlite + development 自动种 alex/admin + demo provider，确定性无 LLM）→ 跑驱动
# （R5-R9 REST 断言）→ R10 重复生成幂等 → 汇总十行记分卡 → 留档 benchmark。
# 全程只在隔离端口（默认 3399）自包含运行，不影响宿主机 3000 的既有开发后端。
#
# 用法：
#   cd Server-NestJS && npm run verify:protocol-trust
#   # 或：BENCH_PORT=3399 EXECUTOR=github_handle bash scripts/proof-protocol-trust.sh
# 环境：
#   EXECUTOR=<github_id>   提供则记 R2 为有效 stranger（缺省 = 作者自跑，结论降为「内部预跑」）
#   MUT_SPEC=<specs/xxx.json>  默认 specs/invoices.json（须 repo-root 相对路径）
# 输出：docs/benchmark/protocol-trust-card-<ts>.md（记分卡）+ proof-evidence-root-*.json
# 退出码：0 = 无红行（黄/绿可），1 = 存在红行（红 = 诊断，见规格 §0/§6）

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BE="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$(cd "$BE/.." && pwd)"
PORT="${BENCH_PORT:-3399}"
BASE="http://localhost:${PORT}/api/v1"
REPORT_DIR="$BE/docs/benchmark"
SERVER_LOG="$REPORT_DIR/proof-trust-server.log"
SCORE="$(mktemp)"
DRIVER_OUT="$(mktemp)"
mkdir -p "$REPORT_DIR"
TS="$(date -u +%Y-%m-%dT%H-%M-%S-UTC)"
MUT_SPEC="${MUT_SPEC:-specs/invoices.json}"
# 平台鲁棒 MUT 解析：git-bash 的 $ROOT 是 POSIX /c/...，Windows Node 读不了 → cygpath -m 转 C:/…
# （Linux 无 cygpath 直接走 POSIX 路径）；仍失败用 spec 文件名兜底
MUT_SPEC_ABS="$(cygpath -m "$ROOT/$MUT_SPEC" 2>/dev/null || echo "$ROOT/$MUT_SPEC")"
MUT="$(node -e "const fs=require('fs');const s=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(s.plural||s.module)" "$MUT_SPEC_ABS" 2>/dev/null || echo "$(basename "$MUT_SPEC" .json)")"
SINGULAR="${MUT%s}"
EXECUTOR="${EXECUTOR:-}"

KEY_FIX="$(printf '%s' 'keelbase-proof-trust-demo-key' | sha256sum | cut -d' ' -f1)"
BASELINE="$(cd "$ROOT" && git rev-parse --short HEAD 2>/dev/null || echo n/a)-$(cd "$ROOT" && git symbolic-ref --short HEAD 2>/dev/null || echo unknown)"
START=$SECONDS

row() { echo "$1|$2|$3" >> "$SCORE"; }
# 驱动行统一去 ROW| 前缀（SCORE 约定 3 列 id|st|dt，避免卡表出现多余 ROW 列）
driver_rows() { grep '^ROW|' "$DRIVER_OUT" | sed 's/^ROW|//' >> "$SCORE" || true; }
# 可靠停后端：先 TERM，再等，仍存活则按平台强制结束（git-bash 的 kill 对原生 node 子进程常无效，会遗留占用 sqlite）
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
  for i in 1 2 3; do rm -f "$BE/data/proof.sqlite" 2>/dev/null && break; sleep 1; done
}
SERVER_PID=""
trap cleanup EXIT

echo "═══ Protocol×Trust Proof Card（一键编排）═══"
echo "MUT=$MUT | spec=$MUT_SPEC | BASE=$BASE | baseline=$BASELINE | executor=${EXECUTOR:-作者自跑（内部预跑）}"
echo ""

# ── R1 起点环境 ─────────────────────────────────────────────────────────────
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  V="$(node -v | sed 's/v//')"
  MAJ="${V%%.*}"
  [ "$MAJ" -ge 20 ] && NODE_OK=1
fi
if [ "$NODE_OK" = "1" ]; then row "R1" "green" "Node $(node -v) + npm 可用（场景 A：依赖已预装）";
else row "R1" "red" "需 Node ≥20（当前 $(node -v 2>/dev/null || echo 缺失)）"; fi

# ── R2 有效陌生开发者 ───────────────────────────────────────────────────────
if [ -n "$EXECUTOR" ]; then row "R2" "green" "执行者 github=$EXECUTOR（声明满足 S-1..S-4，见规格 §3）";
else row "R2" "yellow" "执行者未声明 = 作者自跑（内部预跑，对外不可声明 PASS）"; fi

# ── R4 Protocol 生成 ─────────────────────────────────────────────────────────
GEN_START=$SECONDS
echo "→ 生成 MUT（$ROOT：node scripts/keelbase-init.mjs --spec $MUT_SPEC --force）"
GEN_LOG="$REPORT_DIR/proof-trust-gen.log"
# --force：覆盖重写生成文件 + 接线幂等——fresh clone 下无副作用，重跑幂等（生成器契约：目录已存在须 --force）
if (cd "$ROOT" && node scripts/keelbase-init.mjs --spec "$MUT_SPEC" --force >"$GEN_LOG" 2>&1); then
  GEN_FILES=$(grep -cE '✓ (write|生成|→)|wrote' "$GEN_LOG" 2>/dev/null || echo 0)
  row "R4" "green" "生成成功（$MUT，log=$GEN_LOG）"
else
  row "R4" "red" "keelbase-init 生成失败（tail）: $(tail -8 "$GEN_LOG" | tr '\n' ' ')"
  driver_rows; echo "═══ 生成失败终止（无红即失败见规格 §0 红行=诊断）═══"; cat "$SCORE"; exit 1
fi
# 生成后必须已把 create_<s>/query_<p> 接进 ai.module（静态预检）
BE_AI="$BE/src/ai/ai.module.ts"
if grep -qE "Create.*Tool|create-${MUT}" "$BE_AI" 2>/dev/null && grep -qE "Query.*Tool|query-${MUT}" "$BE_AI" 2>/dev/null; then
  row "R6s" "green" "ai.module.ts 已注册生成工具（静态接线）"
else
  row "R6s" "yellow" "ai.module 未见工具注册关键词（以运行时 /ai/tools 为准，R6）"
fi
GEN_ELAPSED=$((SECONDS - GEN_START))

# ── 编译 + 起隔离后端 ────────────────────────────────────────────────────────
echo "→ build"
BUILD_START=$SECONDS
if ! (cd "$BE" && npm run build >/dev/null 2>>"$SERVER_LOG"); then
  row "R1b" "red" "后端编译失败（tail $SERVER_LOG）"; driver_rows; cat "$SCORE"; exit 1
fi
BUILD_ELAPSED=$((SECONDS - BUILD_START))
echo "  ✓ 编译通过（${BUILD_ELAPSED}s）"

rm -f "$BE/data/proof.sqlite"
export NODE_ENV=development PORT=$PORT DB_PATH=./data/proof.sqlite
export JWT_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export ENCRYPTION_KEY="$KEY_FIX" ENCRYPTION_HMAC_KEY="$KEY_FIX" AUDIT_HMAC_KEY="$KEY_FIX"
export QUEUE_ENABLED=false CACHE_ENABLED=false
(cd "$BE" && exec node dist/main >"$SERVER_LOG" 2>&1) &
SERVER_PID=$!

echo "→ 等待后端就绪（$BASE）"
READY=0
for i in $(seq 1 120); do
  if curl -s -m 2 "$BASE/health" >/dev/null 2>&1; then READY=1; break; fi
  [ "$i" = "120" ] && break
  sleep 1
done
if [ "$READY" != "1" ]; then
  row "R1c" "red" "后端 120s 未就绪（日志尾）: $(tail -20 "$SERVER_LOG" | tr '\n' ' ')"
  driver_rows; cat "$SCORE"; exit 1
fi
echo "  ✓ 就绪"

# ── R5-R9 驱动 ───────────────────────────────────────────────────────────────
echo "→ proof-protocol-trust-card（R5-R9，生成模块治理链路）"
DRV_START=$SECONDS
(cd "$BE" && BASE_URL="$BASE" PROVIDER=demo AUDIT_HMAC_KEY="$KEY_FIX" MUT="$MUT" MUT_SINGULAR="$SINGULAR" MUT_SPEC_ABS="$MUT_SPEC_ABS" \
  node scripts/proof-protocol-trust-card.mjs >"$DRIVER_OUT" 2>&1)
DRV_STATUS=$?
DRV_ELAPSED=$((SECONDS - DRV_START))
cat "$DRIVER_OUT"
driver_rows
if [ "$DRV_STATUS" != "0" ]; then echo "  ⚠ 驱动退出码 $DRV_STATUS（红行=诊断，见下方记分卡）"; else echo "  ✓ 驱动全过"; fi

# ── 停后端 ───────────────────────────────────────────────────────────────────
stop_server

# ── R10 重复生成不破坏（幂等，离线）────────────────────────────────────────
# 生成器 CLI 契约：模块目录已存在时须 --force（覆盖重写生成文件 + 接线幂等），否则拒绝
# 加固：仅 grep 工具关键词会漏「inject 数组重复插入」这类假绿（2026-09-10 陌生模拟暴露）——显式计 inject 内 service 出现次数须恰好 1。
RERUN_LOG="$REPORT_DIR/proof-trust-rerun.log"
SVC_TOKEN="$(echo "${MUT^}")Service, "   # inject 形态 `XService, `（尾空格；provider 行是 `: XService,` 无尾空格，不误计）
if (cd "$ROOT" && node scripts/keelbase-init.mjs --spec "$MUT_SPEC" --force >"$RERUN_LOG" 2>&1); then
  SVC_COUNT="$(grep -oF "$SVC_TOKEN" "$BE_AI" | wc -l | tr -d ' ')"
  if grep -qE '✗' "$RERUN_LOG"; then
    row "R10" "red" "同 spec 重跑（--force）有错误行: $(tail -5 "$RERUN_LOG" | tr '\n' ' ')"
  elif [ "$SVC_COUNT" != "1" ]; then
    row "R10" "red" "重跑后 ai.module inject 内 ${SVC_TOKEN% } 出现 ${SVC_COUNT} 次（应 1）——接线非幂等（重复 inject 会致位置式 DI 错位）"
  elif grep -qE "Create.*Tool|create-${MUT}" "$BE_AI" && grep -qE "Query.*Tool|query-${MUT}" "$BE_AI"; then
    row "R10" "green" "同 spec 重跑（--force）幂等成功——生成文件覆盖重写、ai.module 接线未破坏（inject 无重复；规格 §7）"
  else
    row "R10" "red" "同 spec 重跑（--force）退出 0 但 ai.module 工具接线丢失"
  fi
else
  row "R10" "red" "同 spec 重跑（--force）失败: $(tail -5 "$RERUN_LOG" | tr '\n' ' ')"
fi

# ── R3 计时（分段）───────────────────────────────────────────────────────────
TOTAL=$((SECONDS - START))
row "R3" "green" "T_exec=${TOTAL}s（生成 ${GEN_ELAPSED}s + 编译 ${BUILD_ELAPSED}s + 起服+驱动 ${DRV_ELAPSED}s）；T_read 由执行者自报（不合并）"

# ── 汇总记分卡 ───────────────────────────────────────────────────────────────
CARD="$REPORT_DIR/protocol-trust-card-$TS.md"
REDS=$(grep -cE '\|red\|' "$SCORE" || true)
YELLOWS=$(grep -cE '\|yellow\|' "$SCORE" || true)
{ echo "# Protocol × Trust Proof Card — $TS"
  echo ""
  echo "> 关联：internal-roadmap §internal.7 T2 · 规格 docs/protocol-trust-proof-card.spec.md · 裁决 §5-§7（内部）"
  echo ""
  echo "| 项 | 值 |"
  echo "|---|---|"
  echo "| 基线 | $BASELINE |"
  echo "| 场景 | A（依赖预装，隔离后端 + fresh sqlite + demo provider，确定性无 LLM） |"
  echo "| MUT | $MUT（$MUT_SPEC） |"
  echo "| 执行者 | ${EXECUTOR:-作者自跑（内部预跑，非有效 stranger）} |"
  echo "| T_exec | ${TOTAL}s（生成 ${GEN_ELAPSED}s；编译 ${BUILD_ELAPSED}s；起服+驱动 ${DRV_ELAPSED}s） |"
  echo "| 红行 | ${REDS} |"
  echo ""
  echo "## 十行状态"
  echo ""
  echo "| 行 | 状态 | 明细 |"
  echo "|---|---|---|"
  while IFS='|' read -r id st dt; do
    [ -n "$id" ] && echo "| $id | $st | $dt |"
  done < "$SCORE"
  echo ""
  echo "## 结论（规格 §6）"
  echo ""
  if [ "${REDS}" != "0" ]; then
    echo "**FAIL**——红行 = 诊断：反推基座缺口（§internal.6 30%）→ 修复后重跑卡。"
  elif [ -n "$EXECUTOR" ]; then
    echo "**PASS（对外可声明）**——真实 stranger 执行无红行 → §internal.6 M1/企业试点 或 需求驱动重开协议。"
  else
    echo "**内部预跑（待外部验证）**——无红行但执行者=作者；正式 PASS 需真实 stranger（EXECUTOR=github_id）重跑。"
  fi
  echo ""
  echo "## 复现"
  echo ""
  echo '```bash'
  echo "cd Server-NestJS && npm run verify:protocol-trust   # EXECUTOR=<github_id> 可选"
  echo '```'
  echo ""
  echo "跑一次即产本卡 + proof-evidence-root-*.json（离线可复核）；重跑基线须一致。"
} > "$CARD"

echo ""
echo "═══ 记分卡：$CARD（红行=${REDS}）═══"
cat "$CARD"
echo ""
[ "${REDS}" = "0" ] && exit 0 || exit 1
