#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# KeelBase Release Gate 统一入口（W3，专家 08-21 建议）
#
# 把现有验证脚本串成五维 + Adversarial + Gate 1 Golden Application → PASS/FAIL，
# 一命令证明「Build / Run / Trust / Private 已可重复验证」。
# 确定性部分（Build/Gate1/Trust/Private/迁移一致性）可进 CI；LLM 部分（Run/Adversarial）需 LLM_ENV=1（DeepSeek/Ollama）。
# Trust 维度含：三旗舰 + 生成模块 + 跨入口一致性(T5) + 失败路径(KB-4) + 撤销验收(G4) +
# 信任行为矩阵(§14 Duplicate/Concurrent/Partial) + 治理台 HTTP e2e + 审计链并发压测（分叉 0 + verify 全绿）。
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

# ── Gate 1：Golden Application = AI CRM 一次跑通闭环──
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
# 生成器/CLI 单测（与 CI 的 cli:test 同源；含接线幂等、撞名拒绝等回归）——此前仅 CI 跑、本地发版门禁漏跑
if npm run cli:test >/dev/null 2>&1; then gate "Build(生成器/CLI 单测)" pass; else gate "Build(生成器/CLI 单测)" fail "npm run cli:test"; fi

# ── Endpoints：文档 ↔ 端点一致性（§7.4 #5 发布前核对）─────────────────────────
echo "→ [Endpoints] CLAUDE.md §9 声明端点 vs 实际 Controller 路由"
if node scripts/verify-endpoint-docs.mjs >/dev/null 2>&1; then
  gate "Endpoints(文档-端点一致)" pass
else
  gate "Endpoints(文档-端点一致)" fail "声明端点缺失（文档过期或路由被删）——先修 CLAUDE.md §9 或补路由"
fi

# ── Trust：三旗舰 + 生成模块 e2e（越权/写确认/审计）────────────────────────────
# 分 4 批跑：这 14 个套件放进**一次** jest 调用会命中本机已知的「单进程长跑硬崩」——
# 进程中途无输出死亡（无 jest 汇总行），缺 PASS 行 → 闸门自身间歇假红（实测同一刀三次：
# 24/0、14/10、17/7，失败项全是服务依赖型检查、无任何测试失败）。分片缩短单进程时长以规避。
# 判据不削弱：仍逐套件 grep jest 的 "PASS test/<name>.e2e-spec.ts"，真实失败照旧 FAIL。
# CI 的 release-gate job 跑的是同一脚本（形态相同，分片对它同样成立）；CI 上是否复现该硬崩未实测。
echo "→ [Trust] 越权 / 写确认 / 审计"
(cd Server-NestJS && rm -f data/test.sqlite)
# 套件清单单一真源：批次切分与逐套件判定都从这里派生（避免两处平行列表漂移）
E2E_SUITES=(
  "crm:CRM" "pm:PM" "approval:Approval"
  "generated-modules:生成模块" "generated-module-governance:生成模块治理缺省(30min闭环)" "explainable-authz:Explainable Authz"
  "cross-entry-consistency:跨入口决策一致性(T5)" "failure-path:失败路径回归(KB-4)"
  "revoke-acceptance:撤销验收(G4)" "trust-behavior-matrix:信任行为矩阵(§14)"
  "governance-plane:治理台HTTP" "crm-trust-failure-path:CRM失败路径(A2)"
  "pm-trust-failure-path:PM失败路径(A2)" "approval-trust-failure-path:Approval失败路径(A2)"
)
E2E_BATCHES=4   # 按套件数均分；轮转取用，使重套件分散到不同批
E2E_BATCH_OUT=(); E2E_BATCH_LIST=()
for ((b = 0; b < E2E_BATCHES; b++)); do
  batch_files=(); batch_names=""
  for ((i = b; i < ${#E2E_SUITES[@]}; i += E2E_BATCHES)); do
    name="${E2E_SUITES[i]%%:*}"
    batch_files+=("test/${name}.e2e-spec.ts"); batch_names="${batch_names}${batch_names:+ }${name}"
  done
  echo "  · e2e 批次 $((b+1))/${E2E_BATCHES}（${#batch_files[@]} 套件）：${batch_names}"
  E2E_BATCH_OUT[b]=$(cd Server-NestJS && npx jest --config test/jest-e2e.json "${batch_files[@]}" 2>&1) || true
  E2E_BATCH_LIST[b]="${batch_names}"
done
E2E_OUT=$(printf '%s\n' "${E2E_BATCH_OUT[@]}")
failed_e2e=""
for t in "${E2E_SUITES[@]}"; do
  name="${t%%:*}"; label="${t##*:}"
  if grep -q "PASS test/${name}.e2e-spec.ts" <<<"$E2E_OUT"; then gate "Trust(${label})" pass; else gate "Trust(${label})" fail "e2e"; failed_e2e="${failed_e2e} ${name}"; fi
done
# 失败可诊断：**按批**回显 jest 输出尾部（否则日志只有 "FAIL — e2e"，无法定位是哪批哪个套件）。
# 按批而非只回显总输出尾部——单次调用时早期套件的失败明细会被后面的输出挤出尾部窗口。
# 硬崩的批输出为空，只留下「· 批次 N ·」标记，该标记本身即是崩溃特征。
if [ -n "$failed_e2e" ]; then
  echo "── 失败 e2e 明细（${failed_e2e}）— 按批回显 jest 输出尾部 ──"
  for ((b = 0; b < E2E_BATCHES; b++)); do
    batch_failed=""
    for name in ${E2E_BATCH_LIST[b]}; do
      case " ${failed_e2e} " in *" ${name} "*) batch_failed="${batch_failed} ${name}";; esac
    done
    if [ -z "$batch_failed" ]; then continue; fi
    echo "·· 批次 $((b+1))/${E2E_BATCHES}（失败：${batch_failed}）· jest 输出尾部 ··"
    printf '%s\n' "${E2E_BATCH_OUT[b]}" | tail -n 160
  done
  echo "── /失败 e2e 明细 ──"
fi

# ── Trust：撤销幂等单元（单条 ↔ 批量一致：已撤销/已补偿不重复触发外部补偿）────────────
echo "→ [Trust] 撤销幂等单元（tool-effects）"
if (cd Server-NestJS && npx jest src/ai/tool-effects --forceExit >/dev/null 2>&1); then gate "Trust(撤销幂等单元)" pass; else gate "Trust(撤销幂等单元)" fail "jest src/ai/tool-effects"; fi

# ── Trust：审计链并发压测（HS-11 完整性基线：分叉 0 + verify 全绿 + 吞吐/P95）──
echo "→ [Trust] 审计链并发压测"
if (cd Server-NestJS && npm run audit:chain:load >/dev/null 2>&1); then gate "Trust(审计链压测)" pass; else gate "Trust(审计链压测)" fail "audit:chain:load"; fi

# ── Trust：CE-1 协议契约常绿（conformance + 生产金样本复现 + wire Schema v1 + 术语闸 + evidence canonical + 场景包漂移）──
echo "→ [Trust] CE-1 协议契约（conformance + canonical/wire + 语言 + evidence-canonical + 场景包）"
if (cd Server-NestJS && npm run conformance >/dev/null 2>&1 && npm run test:protocol-corpus >/dev/null 2>&1 && npm run language:guard >/dev/null 2>&1 && npm run check:evidence-canonical >/dev/null 2>&1 && npm run scenarios:check >/dev/null 2>&1); then
  gate "Trust(CE-1 协议语料+wire Schema+术语+证据canonical+场景包)" pass
else
  gate "Trust(CE-1 协议语料+wire Schema+术语+证据canonical+场景包)" fail "conformance / test:protocol-corpus / language:guard / check:evidence-canonical / scenarios:check"
fi

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
