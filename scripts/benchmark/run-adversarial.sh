#!/usr/bin/env bash
#
# Run/Adversarial 云端实证（§7.4 #2）：起后端 → seed → agent-benchmark + verify-security-eval。
# 证明平台不依赖人在场——真实 LLM 对话（Run/Safety）+ 攻击集回归（Adversarial）。
#
# 自包含：在自己端口起一个隔离后端（fresh sqlite + dev 自动建 alex/admin），跑完即停，
# 不影响宿主机 3000 上已有的开发后端。
#
# 用法：
#   DEEPSEEK_API_KEY=... ./scripts/benchmark/run-adversarial.sh          # 默认 deepseek-v4-flash
#   PROVIDER=deepseek MODEL=deepseek-v4-flash ./scripts/benchmark/run-adversarial.sh
#
# 输出：docs/benchmark/agent-benchmark-<ts>.md + json + security-eval 报告；退出码 0=全过。
# CI 接线：job 用 continue-on-error 标注（非阻塞），缺 key 时脚本报错退出（由 CI if 跳过）。

set -euo pipefail
cd "$(dirname "$0")/../.."

PORT="${BENCH_PORT:-3100}"
BASE="http://localhost:${PORT}/api/v1"
PROVIDER="${PROVIDER:-deepseek}"
MODEL="${MODEL:-deepseek-v4-flash}"
REPORT_DIR="docs/benchmark"
SERVER_LOG="$REPORT_DIR/adversarial-server.log"
mkdir -p "$REPORT_DIR"

if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "✗ 缺少 DEEPSEEK_API_KEY——Run/Adversarial 需要 LLM 云端 key" >&2
  exit 1
fi

echo "═══ Run/Adversarial 云端实证（起后端 + LLM 对话 + 攻击集回归）═══"
echo "目标 $BASE | provider=$PROVIDER model=$MODEL"
echo ""

# ── 构建后端 ──────────────────────────────────────────────────────────────────
echo "→ build"
if ! (cd Server-NestJS && npm run build >/dev/null 2>&1); then
  echo "  ✗ 后端编译失败" >&2
  exit 1
fi
echo "  ✓ 编译通过"

# ── 起隔离后端（fresh sqlite + development 自动种 alex/admin）────────────────
rm -f Server-NestJS/data/adversarial.sqlite
export NODE_ENV=development
export PORT=$PORT
export DB_PATH=./data/adversarial.sqlite
export JWT_SECRET="$(openssl rand -hex 32)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export ENCRYPTION_KEY="$(openssl rand -hex 32)"
export ENCRYPTION_HMAC_KEY="$(openssl rand -hex 32)"
export AI_PROVIDER=deepseek
export DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY"
# CI 无 Redis：队列降级同步执行 + 缓存直查库（AI 对话链路不依赖队列）
export QUEUE_ENABLED=false
export CACHE_ENABLED=false

(cd Server-NestJS && node dist/main > "$SERVER_LOG" 2>&1) &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

echo "→ 等待后端就绪"
for i in $(seq 1 60); do
  if curl -s -m 2 "$BASE/health" >/dev/null 2>&1; then break; fi
  if [ "$i" = "60" ]; then
    echo "  ✗ 后端 60s 未就绪（日志尾）：" >&2
    tail -30 "$SERVER_LOG" >&2
    exit 1
  fi
  sleep 1
done
echo "  ✓ 就绪（$BASE）"

# ── seed：flagship 数据（alex/admin 已由 dev 自动建，seed:demo 补三旗舰数据）──
echo "→ seed（三旗舰演示数据）"
if (cd Server-NestJS && DB_PATH=./data/adversarial.sqlite NODE_ENV=development npm run seed:demo >/dev/null 2>&1); then
  echo "  ✓ 演示数据就绪"
else
  echo "  ⚠ seed:demo 未完全成功（继续——benchmark 部分场景可能缺数据）"
fi

# ── Agent Benchmark（LLM Run/Safety，五类 × 三旗舰 = 15 用例）─────────────────
echo ""
echo "→ Agent Benchmark（Run/Trust/Safety 三分数）"
PASS=0; FAIL=0
if BASE_URL="$BASE" PROVIDER="$PROVIDER" MODEL="$MODEL" node scripts/benchmark/agent-benchmark.mjs; then
  echo "  ✓ Agent Benchmark 全过"
  PASS=$((PASS+1))
else
  echo "  ✗ Agent Benchmark 有 fail（逐用例见 docs/benchmark/agent-benchmark-*.md）"
  FAIL=$((FAIL+1))
fi

# ── Agent Security Eval 安全回归（攻击集，默认 90% 门槛）─────────────────────
echo ""
echo "→ Agent Security Eval 安全回归（攻击集）"
if BASE_URL="$BASE" ./scripts/verify-security-eval.sh; then
  echo "  ✓ 安全回归通过"
  PASS=$((PASS+1))
else
  echo "  ✗ 安全回归未达标"
  FAIL=$((FAIL+1))
fi

echo ""
echo "═══ Run/Adversarial: $([ $FAIL -eq 0 ] && echo 'PASS' || echo 'FAIL')（${PASS} pass / ${FAIL} fail）═══"
[ $FAIL -eq 0 ]
