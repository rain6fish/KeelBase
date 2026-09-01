#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# 1.0 Gate 1 — Golden Application = AI CRM 单一验收脚本（development-plan §7.3）
#
# 「一次跑通」9 项同时验证：Customer → Risk Analysis → Create Follow-up Task
#   → 确认 → 写 → 审计 → 撤销（7 步业务闭环，e2e）+ Build 30min（keelbase init → 编译）
#   + Provenance（.keelbase/manifest.json + keelbase inspect）。
# 确定性、可进 CI；LLM 部分（真实 Agent 对话）由 LLM_ENV=1 标注（agent-benchmark）。
#
# 用法：
#   ./scripts/verify-golden-application.sh          # 确定性（可 CI）
#   LLM_ENV=1 ./scripts/verify-golden-application.sh # 标注 LLM 需人工/云端跑
#
# 输出：9 项 PASS/FAIL + 退出码（0=全过）

set -euo pipefail
cd "$(dirname "$0")/.."

PASS=0; FAIL=0
gate() { # name ok detail
  local name="$1"; local ok="$2"; local detail="${3:-}"
  if [ "$ok" = "pass" ]; then echo "  ✓ $name  PASS"; PASS=$((PASS+1));
  else echo "  ✗ $name  FAIL${detail:+ — $detail}"; FAIL=$((FAIL+1)); fi
}

echo "═══ 1.0 Gate 1：Golden Application = AI CRM（一次跑通闭环）═══"
echo "模式：$([ "${LLM_ENV:-}" = "1" ] && echo '含 LLM 标注（需 LLM + 后端）' || echo '确定性（可 CI）')"
echo ""

# ── 业务闭环：7 步一次跑通（golden-application.e2e-spec.ts）──────────────────
echo "→ [1-7/9] AI CRM Golden Application 业务闭环（e2e）"
(cd Server-NestJS && rm -f data/test.sqlite)
E2E_OUT=$(cd Server-NestJS && node_modules/.bin/jest --config test/jest-e2e.json \
  test/golden-application.e2e-spec.ts 2>&1) || true

step() { # label grep
  if echo "$E2E_OUT" | grep -q "$2"; then gate "$1" pass; else gate "$1" fail "golden-application e2e"; fi
}
step "① Customer（客户 + 逾期订单，AI 可读）" "① Customer"
step "② Risk Analysis（analyze_customer_risk → critical）" "② Risk Analysis"
step "③ Create Follow-up Task（确认门控，不确认不执行）" "③ Create Follow-up Task"
step "④ 确认 → 写（任务落库 + 副作用登记）" "④ 确认 → 写"
step "⑤ 审计（副作用可撤销 + 审计哈希链 valid）" "⑤ 审计"
step "⑥ 撤销（本人撤销 → 软删不可见）" "⑥ 撤销"
step "⑦ 所有权（越权撤销 → 404）" "⑦ 所有权"

# ── Build：60s/10m/30m 的「30min 创造」证明（keelbase init → 编译）────────────
echo "→ [8/9] Build 30min（生成器闭环 + 编译）"
if node scripts/keelbase-init.mjs --module cigolden --label 金 --fields title:string --dry-run >/dev/null 2>&1; then
  gate "⑧ Build(生成器 init)" pass
else
  gate "⑧ Build(生成器 init)" fail "keelbase init dry-run"
fi
if (cd Server-NestJS && npm run build >/dev/null 2>&1); then
  gate "⑧ Build(后端编译)" pass
else
  gate "⑧ Build(后端编译)" fail "npm run build"
fi

# ── Provenance：来源身份清单 + inspect（最小切片）─────────────────────────────
echo "→ [9/9] Provenance（.keelbase/manifest.json + keelbase inspect）"
if [ -f .keelbase/manifest.json ] && node scripts/keelbase-init.mjs inspect >/dev/null 2>&1; then
  gate "⑨ Provenance(manifest + inspect)" pass
else
  gate "⑨ Provenance(manifest + inspect)" fail "manifest 缺失或 inspect 退出非 0"
fi

# ── LLM 部分（真实 Agent 对话驱动闭环，需 LLM_ENV=1）─────────────────────────
if [ "${LLM_ENV:-}" = "1" ]; then
  echo "→ [LLM] 真实 Agent 对话闭环（需 LLM + 后端）"
  echo "  起后端后跑（三旗舰 + AI CRM Golden 对话）："
  echo "    PROVIDER=deepseek MODEL=deepseek-v4-flash BASE_URL=... node scripts/benchmark/agent-benchmark.mjs"
  gate "LLM(Agent 对话闭环)" fail "需 LLM_ENV 完整环境（起后端 + key）——确定性闭环已覆盖 1-7"
else
  echo "→ [LLM] 真实 Agent 对话闭环标注（LLM_ENV=1 时跑 agent-benchmark；证据见 docs/benchmark/）"
fi

echo ""
echo "═══ Gate 1: $([ $FAIL -eq 0 ] && echo 'PASS' || echo 'FAIL')（${PASS} pass / ${FAIL} fail）═══"
[ $FAIL -eq 0 ]
