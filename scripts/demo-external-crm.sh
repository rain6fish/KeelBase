#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# EB-1 Enterprise Capability Bridge Demo：外部 CRM 接入（不替换系统，获得 AI 能力）
#
# 复用 AI Bridge（--import-openapi-proxy）：把一个「既有 CRM 系统」的 OpenAPI 描述
# 转成 B 路径 Proxy 工具——AI 在治理约束下读取外部客户/订单（R1 自动）、写回跟进任务/改价（R3 需人工确认）。
#
# 用法：
#   ./scripts/demo-external-crm.sh              # 生成 proxy 配置 + 展示工具（无需后端）
#   ./scripts/demo-external-crm.sh --apply      # 额外把配置写入 Settings（需后端运行，重启后工具生效）
#
# 业务闭环（演示「不替换系统获得 AI 能力」）：
#   用户问「哪些客户值得跟进」 → AI 读外部客户/订单（list_customers / list_customer_orders）
#   → 风险分析 → 建跟进任务（create_followup_task，R3 需确认）→ 写回外部 CRM（proxy_call 副作用）
#   → 审计哈希链 → 撤销（B 路径 Java 补偿 / revokePath）

set -euo pipefail
cd "$(dirname "$0")/.."

SPEC=specs/external-crm.openapi.json
BASE_URL=http://legacy-crm:8080/api
AUDIENCE=legacy-crm

echo "═══ KeelBase EB-1 演示：外部 CRM 接入（不替换系统获得 AI 能力）═══"
echo ""

echo "① 外部 CRM OpenAPI 描述：$SPEC"
node -e "const s=require('./'+process.argv[1]); console.log('   路径数:', Object.keys(s.paths).length);" "$SPEC"

echo ""
echo "② 经 AI Bridge 生成 B 路径 Proxy 配置（读=R1 写=R3，x-keelbase-risk-level 覆盖）"
# CLI stdout 含人类可读摘要，提取 JSON 部分（首个 { 到末个 }）
RAW="$(node scripts/keelbase-init.mjs --import-openapi-proxy "$SPEC" --base-url "$BASE_URL" --audience "$AUDIENCE" 2>/dev/null)"
PROXY_JSON="$(printf '%s' "$RAW" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=d.indexOf('{');const e=d.lastIndexOf('}');console.log(d.slice(s,e+1));})")"

echo ""
echo "③ 生成的工具（AI 可调用 + 治理分级）："
node -e "
const c = JSON.parse(process.argv[1]);
const riskLabel = { R1: '自动（读）', R3: '需人工确认（写）', R4: '双人审批（写）', R5: '阻断' };
for (const t of c.tools) console.log('   ' + t.method.padEnd(5), t.path.padEnd(30), '→ ' + t.name.padEnd(24), '| risk ' + t.riskLevel + ' ' + (riskLabel[t.riskLevel] || ''));
" "$PROXY_JSON"

echo ""
echo "④ 业务闭环（用户视角）：
   你：「哪些客户值得跟进？」
   AI：读外部客户/订单（R1 自动）→ 分析风险 → 建议创建跟进任务
       → 请求确认（R3 写门控）→ 确认 → 写回外部 CRM（proxy_call 副作用）
       → 审计哈希链 → 可撤销（B 路径 Java 补偿 / revokePath）"

if [ "${1:-}" = "--apply" ]; then
  echo ""
  echo "⑤ 应用到运行时（需后端运行）：PUT /settings/ai_proxy_tools 写入配置，重启后工具生效"
  echo "   echo \"\$PROXY_JSON\" | curl -X PUT http://localhost:3000/api/v1/settings/ai_proxy_tools \\"
  echo "     -H 'Content-Type: application/json' -H 'Authorization: Bearer <admin-token>' -d @-"
else
  echo ""
  echo "   （加 --apply 参数把配置写入后端 Settings；真实 LLM 演示见 docs/manual/external-crm-demo.md）"
fi
