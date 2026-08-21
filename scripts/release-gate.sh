#!/usr/bin/env bash
#
# KeelBase Release Gate 统一入口（W3，专家 08-21 建议）
#
# 把现有验证脚本串成五维 + Adversarial + Gate 1 Golden Application → PASS/FAIL，
# 一命令证明「Build / Run / Trust / Private 已可重复验证」。
# 确定性部分（Build/Gate1/Trust/Private/迁移一致性）可进 CI；LLM 部分（Run/Adversarial）需 LLM_ENV=1（DeepSeek/Ollama）。
#
# 用法：
#   ./scripts/release-gate.sh            # 确定性 Gate（可 CI）
#   LLM_ENV=1 ./scripts/release-gate.sh  # + Run/Adversarial（需 LLM + 后端）
#
# 输出：各维 PASS/FAIL + 退出码（0=全过）

set -euo pipefail
cd "$(dirname "$0")/.."

PASS=0; FAIL=0
gate() { # name ok detail
  local name="$1"; local ok="$2"; local detail="${3:-}"
  if [ "$ok" = "pass" ]; then echo "  ✓ $name  PASS"; PASS=$((PASS+1));
  else echo "  ✗ $name  FAIL${detail:+ — $detail}"; FAIL=$((FAIL+1)); fi
}

echo "═══ KeelBase Release Gate（W3 统一入口）═══"
echo "模式：$([ "${LLM_ENV:-}" = "1" ] && echo 'LLM 全量（需 LLM + 后端）' || echo '确定性（可 CI）')"
echo ""

# ── Gate 1：Golden Application = AI CRM 一次跑通闭环（development-plan §7.3）──
echo "→ [Gate 1] Golden Application = AI CRM（Customer → Risk → 建跟进 → 确认 → 写 → 审计 → 撤销）"
if ./scripts/verify-golden-application.sh >/dev/null 2>&1; then
  gate "Gate1(Golden 闭环 + Build)" pass
else
  gate "Gate1(Golden 闭环 + Build)" fail "verify-golden-application"
fi

# ── Build：后端编译 + 生成器闭环 ──────────────────────────────────────────────
echo "→ [Build] 编译 + 生成器"
if (cd Server-NestJS && npm run build >/dev/null 2>&1); then gate "Build(后端编译)" pass; else gate "Build(后端编译)" fail "npm run build"; fi
if node scripts/keelbase-init.mjs --module cigate --label 门 --fields title:string --dry-run >/dev/null 2>&1; then gate "Build(生成器 init)" pass; else gate "Build(生成器 init)" fail "keelbase init dry-run"; fi

# ── Endpoints：文档 ↔ 端点一致性（§7.4 #5 发布前核对）─────────────────────────
echo "→ [Endpoints] CLAUDE.md §9 声明端点 vs 实际 Controller 路由"
if node scripts/verify-endpoint-docs.mjs >/dev/null 2>&1; then
  gate "Endpoints(文档-端点一致)" pass
else
  gate "Endpoints(文档-端点一致)" fail "声明端点缺失（文档过期或路由被删）——先修 CLAUDE.md §9 或补路由"
fi

# ── Trust：三旗舰 + 生成模块 e2e（越权/写确认/审计）────────────────────────────
echo "→ [Trust] 越权 / 写确认 / 审计"
(cd Server-NestJS && rm -f data/test.sqlite)
E2E_OUT=$(cd Server-NestJS && npx jest --config test/jest-e2e.json \
  test/crm.e2e-spec.ts test/pm.e2e-spec.ts test/approval.e2e-spec.ts \
  test/generated-modules.e2e-spec.ts test/explainable-authz.e2e-spec.ts 2>&1) || true
for t in "crm:CRM" "pm:PM" "approval:Approval" "generated-modules:生成模块" "explainable-authz:Explainable Authz"; do
  name="${t%%:*}"; label="${t##*:}"
  if echo "$E2E_OUT" | grep -q "PASS test/${name}.e2e-spec.ts"; then gate "Trust(${label})" pass; else gate "Trust(${label})" fail "e2e"; fi
done

# ── Private：AIization（已有 Schema → Protocol）+ 迁移一致性 ───────────────────
echo "→ [Private] 数据不出域链路"
if ./scripts/verify-aiization.sh >/dev/null 2>&1; then gate "Private(AIization)" pass; else gate "Private(AIization)" fail "verify-aiization"; fi
# 先 migration:run 建库再 generate（空库直接 generate 会对全量 dump 误判漂移，合成陌生人实测发现）
(cd Server-NestJS && rm -f data/gate.sqlite && DB_PATH=./data/gate.sqlite \
  ENCRYPTION_KEY=$(openssl rand -hex 32) ENCRYPTION_HMAC_KEY=$(openssl rand -hex 32) \
  npm run migration:run >/dev/null 2>&1 || true)
MIG=$(cd Server-NestJS && DB_PATH=./data/gate.sqlite \
  ENCRYPTION_KEY=$(openssl rand -hex 32) ENCRYPTION_HMAC_KEY=$(openssl rand -hex 32) \
  npm run migration:generate -- src/migrations/_GateCheck 2>&1 || true)
if echo "$MIG" | grep -q 'No changes in database schema'; then
  gate "Private(迁移一致性)" pass
else
  gate "Private(迁移一致性)" fail "实体漂移（migration:generate 有 diff）"
fi
rm -f Server-NestJS/src/migrations/*_GateCheck* 2>/dev/null || true

# ── Run / Adversarial（LLM 部分，需 LLM_ENV=1）────────────────────────────────
if [ "${LLM_ENV:-}" = "1" ]; then
  echo "→ [Run/Adversarial] Agent Benchmark + 安全回归（自起隔离后端 + DeepSeek）"
  if ./scripts/benchmark/run-adversarial.sh; then
    gate "Run/Adversarial(LLM)" pass
  else
    gate "Run/Adversarial(LLM)" fail "run-adversarial.sh（缺 DEEPSEEK_API_KEY 或 LLM 场景未过）"
  fi
else
  echo "→ [Run/Adversarial] LLM 部分标注（LLM_ENV=1 时自起后端跑 agent-benchmark + verify-security-eval）"
fi

echo ""
echo "═══ Release Gate: $([ $FAIL -eq 0 ] && echo 'PASS' || echo 'FAIL')（${PASS} pass / ${FAIL} fail）═══"
[ $FAIL -eq 0 ]
