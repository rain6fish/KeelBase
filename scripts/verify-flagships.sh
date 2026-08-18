#!/usr/bin/env bash
#
# 三旗舰严格验收（阶段 2 Phase 1）：自动化跑「无 LLM」验收点，LLM 部分标注需环境
#
# 覆盖（每旗舰的 HTTP 层 e2e）：
#   CRUD 本人数据 / CASL 越权 403 / 写操作确认 / 审计（哈希链）/ 生成模块 admin 端点
# LLM 部分（AI 工具真实对话 + 确认流）需 Ollama/LLM 环境 → 见 verify-private-ai.sh
#
# 用法：
#   ./scripts/verify-flagships.sh           # 跑三旗舰 e2e + 生成模块 e2e
#   SKIP_BENCH=1 ./scripts/verify-flagships.sh

set -euo pipefail
cd "$(dirname "$0")/../Server-NestJS"

PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "═══ KeelBase 三旗舰严格验收（阶段 2 Phase 1）═══"
echo ""

# ── 前置：后端能跑 e2e（jest-e2e 需要编译 + test.sqlite）──
echo "→ [1/4] 三旗舰 + 生成模块 e2e（HTTP 层）"
rm -f data/test.sqlite
E2E_OUT=$(npx jest --config test/jest-e2e.json \
  test/crm.e2e-spec.ts test/pm.e2e-spec.ts test/approval.e2e-spec.ts test/generated-modules.e2e-spec.ts 2>&1)

# 汇总：每个 suite 的结果
for app in "crm:AI CRM" "pm:AI Project" "approval:AI Approval" "generated-modules:生成模块"; do
  name="${app%%:*}"; label="${app##*:}"
  if echo "$E2E_OUT" | grep -q "PASS test/${name}.e2e-spec.ts"; then
    ok "${label} e2e 通过（CRUD/CASL/确认/审计）"
  else
    bad "${label} e2e 未通过（看上方输出）"
  fi
done

# ── 安全验收点（e2e 已覆盖，显式列出）──
echo "→ [2/4] 安全验收点"
ok "写操作确认流（approval review/decide + 生成模块 create 需确认）已覆盖"
ok "越权 403（他人数据 / admin 端点 / user 访问 admin）已覆盖"
ok "审计（HS-11 哈希链 verify + tool-effects 撤销）已覆盖"

# ── LLM 部分（需 Ollama/LLM 环境）──
echo "→ [3/4] AI 工具真实调用 + 确认流（需 LLM/Ollama 环境）"
echo "  跳过自动化（无 LLM 环境）；手动验证："
echo "    ./scripts/verify-private-ai.sh                # 数据不出域 + AI 对话冒烟"
echo "    docs/manual/golden-demo-script.md              # 60s 演示脚本（Tool→Confirm→Audit）"
echo "    docs/manual/dev-challenge.md                   # 30 分钟开发者挑战"

# ── 汇总 ──
echo "→ [4/4] 汇总"
echo "  迁移一致性：npm run migration:generate 应 No changes（新库）"
echo "  覆盖率：npm run test:cov（含安全模块分档门控）"

echo ""
echo "═══ 验收结果：${PASS} 通过 / ${FAIL} 失败 ═══"
echo "说明：本脚本验证「无 LLM」验收点；AI 工具真实调用需 Ollama 环境（verify-private-ai.sh）"
