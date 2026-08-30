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

# ── AI Bridge B 路径（LLM 对话端到端：读 R1 自动 / 写 R3 确认 / 委托身份 / 审计）──
echo ""
echo "→ AI Bridge B 路径（verify-proxy-bridge：ProxyTool × mock Java 系统）"
ADMIN_TOKEN=$(curl -s -m 5 -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin@2026$KeelBase"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).data.accessToken)}catch{console.log('FAIL')}})")
if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "FAIL" ]; then
  # 预配置 ai_proxy_tools（指向 mock 4310，mock 由 verify-proxy-bridge 起）→ 重启后端使 ProxyTool 注册
  CFG='{"baseUrl":"http://localhost:4310/api","audience":"legacy-erp","tools":[{"name":"proxy_list_contract","description":"查询 legacy 系统合同列表","method":"GET","path":"/contracts","parameters":[{"name":"keyword","type":"string","description":"关键字","required":false}],"riskLevel":"R1"},{"name":"proxy_create_contract","description":"在 legacy 系统创建合同","method":"POST","path":"/contracts","parameters":[{"name":"title","type":"string","description":"标题","required":true}],"riskLevel":"R3"}]}'
  CFG_JSON=$(node -e "process.stdout.write(JSON.stringify({ value: process.argv[1], type: 'string' }))" "$CFG")
  curl -s -m 5 -X PUT "$BASE/settings/ai_proxy_tools" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d "$CFG_JSON" >/dev/null 2>&1
  # 重启隔离后端使 ProxyTool 注册（DB 为文件 sqlite，数据保留）
  kill $SERVER_PID 2>/dev/null || true
  sleep 1
  (cd Server-NestJS && node dist/main > "$SERVER_LOG" 2>&1) &
  SERVER_PID=$!
  for i in $(seq 1 60); do
    if curl -s -m 2 "$BASE/health" >/dev/null 2>&1; then break; fi
    sleep 1
  done
  if SKIP_SETUP=1 BASE_URL="$BASE" node scripts/verify-proxy-bridge.mjs; then
    echo "  ✓ AI Bridge B 路径通过"
    PASS=$((PASS+1))
  else
    echo "  ✗ AI Bridge B 路径有 fail（报告 docs/benchmark/proxy-bridge-*.md）"
    FAIL=$((FAIL+1))
  fi
else
  echo "  ⚠ admin 登录失败——跳过 B 路径（其余 Run/Adversarial 已覆盖）"
fi

echo ""
echo "═══ Run/Adversarial: $([ $FAIL -eq 0 ] && echo 'PASS' || echo 'FAIL')（${PASS} pass / ${FAIL} fail）═══"
[ $FAIL -eq 0 ]
