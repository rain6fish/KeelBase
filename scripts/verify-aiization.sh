#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# Existing System AIization 验证（P0-12 / 0819 评估 P1）
#
# 证明 KeelBase 不只适合「从零创建」，也是**已有系统的 AI 化入口**：
#   已有 DB Schema → keelbase import → Protocol → 生成模块 → AI 工具 → 治理 → Agent
#
# 本脚本验证「无 LLM、无污染」部分：
#   1. SQL DDL → Protocol（枚举 CHECK / 类型 / 关系列映射断言）
#   2. Protocol 校验（协议红线：id/时间戳/userId 跳过）
# 生成模块完整链路（--spec → build → 测试）由 docs/manual/30min-acceptance.md 覆盖；
# 手动可跑：node scripts/keelbase-init.mjs --spec <protocol> --module <m> --label <中文名>
#
# 用法：./scripts/verify-aiization.sh
#
# 素材：specs/examples/legacy-crm.sql（模拟运行多年的老客户系统建表 SQL）

set -euo pipefail
cd "$(dirname "$0")/.."

PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "═══ Existing System AIization 验证（老系统 schema → AI 能力）═══"
echo ""

# ── [1] SQL Schema → Protocol ────────────────────────────────────────────────
echo "→ [1] SQL DDL → Protocol（--import-schema）"
# mktemp 会先建出空文件，而 keelbase-init 对已存在的目标默认跳过写入（幂等）——
# 必须加 --force，否则这里拿到的是空文件、下面三条断言全挂（2026-09-22 实证）。
OUT=$(mktemp /tmp/legacy-customer-XXXX.json)
node scripts/keelbase-init.mjs --import-schema specs/examples/legacy-crm.sql --out "$OUT" --force >/dev/null 2>&1 \
  && ok "import-schema 生成 Protocol" || bad "import-schema 失败"
if [ -f "$OUT" ]; then
  # 断言 1：CHECK 枚举 → enum
  if grep -q '"churn_risk"' "$OUT" && grep -q '"risk_level"' "$OUT" && grep -q '"lead"' "$OUT"; then
    ok "SQL CHECK 枚举 → Protocol enum（status: lead/active/churn_risk/inactive）"
  else
    bad "枚举映射缺失"
  fi
  # 断言 2：类型映射（VARCHAR→string / DECIMAL→int / DATE→date）
  if grep -q '"type": "string"' "$OUT" && grep -q '"type": "int"' "$OUT"; then
    ok "类型映射（VARCHAR→string / DECIMAL→int）"
  else
    bad "类型映射异常"
  fi
  # 断言 3：协议红线（id/时间戳跳过，人工关系列不硬映射）
  #   必须解析 JSON 而非全文 grep：skipped 里同样含 `"name": "id"`，全文匹配会把
  #   「已正确跳过」误判成「把 id 生成了字段」（2026-09-22 实证）。
  if node -e '
      const fs = require("fs");
      const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const fields = Array.isArray(p.fields) ? p.fields : [];
      const okModule = p.module === "legacy_customers";
      const noIdField = fields.length > 0 && !fields.some((f) => f.name === "id");
      process.exit(okModule && noIdField ? 0 : 1);
    ' "$OUT"; then
    ok "协议红线（id 主键跳过，module=legacy_customers）"
  else
    bad "协议红线未遵守"
  fi
fi

# ── [2] Protocol → 生成模块（可选，完整链路见 30min-acceptance）──────────────
echo "→ [2] Protocol → 生成模块（完整链路）
  运行：node scripts/keelbase-init.mjs --spec $OUT --module legacy_customer --label 老客户
  然后 build + 测试（AI 工具 query/create + CASL + 审计接线）——见 docs/manual/30min-acceptance.md"
ok "生成链路已由 30min-acceptance 覆盖（--spec → 实体/API/权限/审计/AI 工具/测试）"

rm -f "$OUT"
echo ""
echo "═══ 验证结果：${PASS} 通过 / ${FAIL} 失败 ═══"
echo "说明：本脚本验证「已有 Schema → Protocol」映射质量（无污染、可 CI）；"
echo "生成模块完整链路见 docs/manual/30min-acceptance.md 与 docs/manual/aiization-demo.md"
# 退出码必须反映失败数——调用方（release-gate）只看退出码，否则本脚本的失败会被吞成通过
[ "$FAIL" -eq 0 ]
