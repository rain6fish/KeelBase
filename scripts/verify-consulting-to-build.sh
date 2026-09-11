#!/usr/bin/env bash

# SPDX-License-Identifier: Apache-2.0
#
# S4 全链路验收（Consulting → Build 桥，docs/business-spec.md）：
#   访谈产物（Business Spec JSON）→ business-spec.mjs 确定性映射 → 模块协议 → keelbase init --spec
#   → 生成模块（后端 + 三前端 + AI 工具）→ 编译 → 生成模块单测 → 迁移一致性
#
# 验收（对齐 roadmap S4）：生成模块单测绿 + migration:generate 无漂移 + 验收可追溯。
#
# ⚠ 生成段会**写工作树**（生成模块 + 接线 app.module/app_router/…）。故本脚本**只在干净工作树运行**
#   （脏则直接拒绝）——CI 干净检出可直接跑；本地并行工作时请用临时 worktree：
#     git worktree add --detach /tmp/c2b HEAD && (cd /tmp/c2b && bash scripts/verify-consulting-to-build.sh)
#
# 用法：bash scripts/verify-consulting-to-build.sh [business-spec.json]
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

BS="${1:-.keelbase/business-spec/followup-plans.json}"
SPEC="specs/_c2b-verify.json"
DB="./data/_c2b.sqlite"

log()  { printf '\n── %s\n' "$*"; }
fail() { printf '\n✗ %s\n' "$*" >&2; exit 1; }

# ── 0. 前置：干净工作树（生成段会写文件；脏则拒绝，防污染并行工作区）──────────────
if [ -n "$(git status --porcelain)" ]; then
  fail "工作树不干净——本脚本会生成文件，请在干净检出或临时 worktree 中运行（git worktree add --detach /tmp/c2b HEAD）"
fi
[ -f "$BS" ] || fail "Business Spec 不存在：$BS"

# 生成段产物的清理（tracked 接线改动靠 checkout 还原；untracked 生成物按路径 clean）
cleanup() {
  cd "$ROOT" 2>/dev/null || true
  git checkout -- . >/dev/null 2>&1 || true
  git clean -fdq \
    "Server-NestJS/src/${PLURAL:-__none__}" \
    "Front-Flutter/lib/features/${PLURAL:-__none__}" \
    "Web-Admin-Vue/src/views/${PLURAL:-__none__}" \
    "Front-Taro/src/pages/${PLURAL:-__none__}" \
    "$SPEC" "Server-NestJS/$DB" >/dev/null 2>&1 || true
  rm -f "Server-NestJS/src/ai/tools/query-${PLURAL:-__none__}"*.ts \
        "Server-NestJS/src/ai/tools/create-${PLURAL:-__none__}"*.ts \
        "Web-Admin-Vue/src/api/${PLURAL:-__none__}.ts" \
        "Front-Taro/src/services/${PLURAL:-__none__}"*.ts \
        "Front-Taro/src/types/${PLURAL:-__none__}"*.ts \
        "Front-Taro/src/stores/${PLURAL:-__none__}"*.ts \
        "Server-NestJS/src/migrations/"*_c2b* 2>/dev/null || true
}
trap cleanup EXIT

# ── 1. Business Spec → 模块协议（确定性映射；unmapped 如实列出但不判失败）─────────
log "① 映射：$BS → $SPEC"
node scripts/generator/business-spec.mjs --in "$BS" --out "$SPEC"
[ -f "$SPEC" ] || fail "映射未产出协议文件"

MODULE="$(node -e "process.stdout.write(require('./$SPEC').module||'')")"
PLURAL="$(node -e "process.stdout.write(require('./$SPEC').plural||require('./$SPEC').module||'')")"
[ -n "$MODULE" ] || fail "协议缺 module 字段"
printf '   模块=%s（复数 %s）\n' "$MODULE" "$PLURAL"

# ── 2. 模块协议 → 生成模块（真实写盘）──────────────────────────────────────────
log "② 生成：keelbase init --spec $SPEC"
node scripts/keelbase-init.mjs --spec "$SPEC" >/dev/null

for f in \
  "Server-NestJS/src/$PLURAL/$MODULE.entity.ts" \
  "Server-NestJS/src/$PLURAL/$PLURAL.service.ts" \
  "Server-NestJS/src/$PLURAL/$PLURAL.controller.ts" \
  "Server-NestJS/src/$PLURAL/$PLURAL.module.ts" \
  "Server-NestJS/src/ai/tools/query-$PLURAL.tool.ts" \
  "Server-NestJS/src/ai/tools/create-$PLURAL.tool.ts" \
  "Front-Flutter/lib/features/$PLURAL/presentation/pages/${PLURAL}_page.dart" \
  "Web-Admin-Vue/src/views/$PLURAL/${MODULE^}View.vue" ; do
  [ -f "$f" ] || fail "生成物缺失：$f"
done
printf '   生成物齐（后端 4 + AI 工具 2 + 三前端）\n'

# ── 3. 编译 + 生成模块单测（roadmap S4：单测绿）────────────────────────────────
log "③ 编译 + 生成模块单测"
( cd Server-NestJS && npm run build >/dev/null )
( cd Server-NestJS && npm test --silent -- "$PLURAL" >/tmp/_c2b_jest.log 2>&1 ) || {
  cat /tmp/_c2b_jest.log; fail "生成模块单测未过"; }
grep -qE "Tests:.*[1-9][0-9]* passed" /tmp/_c2b_jest.log || { cat /tmp/_c2b_jest.log; fail "生成模块单测未跑出用例"; }
printf '   %s\n' "$(grep -E 'Tests:' /tmp/_c2b_jest.log | tail -1 | tr -s ' ')"

# ── 4. 迁移一致性（roadmap S4：migration:generate 无漂移）──────────────────────
# 语义：生成模块自带实体但**不带迁移**（`migration:generate` 因此首轮应产出该模块的迁移）；
#      应用后**再生成必须 "No changes"**——即生成物与库结构自洽（无漂移）。
log "④ 迁移：首轮生成该模块迁移 → 应用 → 复生成应为 No changes"
(
  cd Server-NestJS
  export JWT_SECRET='c2b-verify-secret-at-least-32-characters!!'
  export JWT_REFRESH_SECRET='c2b-verify-refresh-at-least-32-chars!!'
  export ENCRYPTION_KEY="$(openssl rand -hex 32)"
  export ENCRYPTION_HMAC_KEY="$(openssl rand -hex 32)"
  rm -f "$DB"
  DB_PATH="$DB" npx typeorm-ts-node-commonjs migration:run -d src/config/typeorm-data-source.ts >/dev/null 2>&1
  DB_PATH="$DB" npx typeorm-ts-node-commonjs migration:generate src/migrations/_c2b_gen -d src/config/typeorm-data-source.ts >/dev/null 2>&1 || true
  ls src/migrations/*_c2b_gen* >/dev/null 2>&1 || fail "首轮未产出模块迁移（生成模块缺实体变化？）"
  DB_PATH="$DB" npx typeorm-ts-node-commonjs migration:run -d src/config/typeorm-data-source.ts >/dev/null 2>&1
  OUT="$(DB_PATH="$DB" npx typeorm-ts-node-commonjs migration:generate src/migrations/_c2b_recheck -d src/config/typeorm-data-source.ts 2>&1 || true)"
  echo "$OUT" | grep -q 'No changes in database schema' \
    || { echo "$OUT"; fail "复生成非 No changes（生成模块与库结构漂移）"; }
  rm -f src/migrations/*_c2b_gen* src/migrations/*_c2b_recheck* 2>/dev/null || true
)

rm -f /tmp/_c2b_jest.log
printf '\n═══ S4 全链路验收：PASS（映射 → 生成 → 编译 → 单测 → 迁移自洽）═══\n'
