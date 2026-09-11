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
# 断言以 `--dry-run` 列出的清单为准（生成器命名不齐一：实体用**单数**、service/controller 用复数、
# Web 视图用 Pascal 复数）——不猜命名，避免断言自身成为脆弱源。
log "② 生成：keelbase init --spec $SPEC"
DRY="$(node scripts/keelbase-init.mjs --spec "$SPEC" --dry-run 2>/dev/null)"
SINGULAR="$(printf '%s\n' "$DRY" | sed -n 's/.*singular=\([A-Za-z0-9_]*\).*/\1/p' | head -1)"
[ -n "$SINGULAR" ] || fail "无法从 dry-run 解析单数名（生成器输出格式已变？）"
PLANNED=()
while IFS= read -r line; do PLANNED+=("$line"); done < <(
  printf '%s\n' "$DRY" | grep -oE '[A-Za-z][A-Za-z0-9_/.-]*\.(ts|dart|vue|scss)$'
)
[ "${#PLANNED[@]}" -gt 0 ] || fail "dry-run 未列出待生成文件"

node scripts/keelbase-init.mjs --spec "$SPEC" >/dev/null

missing=()
for f in "${PLANNED[@]}"; do [ -f "$f" ] || missing+=("$f"); done
[ "${#missing[@]}" -eq 0 ] || { printf '   缺失：\n'; printf '     %s\n' "${missing[@]}"; fail "生成物与 dry-run 清单不一致"; }
# 结构完整性：后端四件套（实体用**单数**）+ AI 工具 + 三前端都在清单里
for pat in "/$SINGULAR\.entity\.ts$" "/$PLURAL\.service\.ts$" "/$PLURAL\.controller\.ts$" "/$PLURAL\.module\.ts$" \
           "/ai/tools/query-$PLURAL\.tool\.ts$" "/ai/tools/create-$PLURAL\.tool\.ts$" \
           "^Front-Flutter/lib/features/$PLURAL/" "^Web-Admin-Vue/" "^Front-Taro/"; do
  printf '%s\n' "${PLANNED[@]}" | grep -qE "$pat" || fail "生成清单缺结构件：/${pat}/"
done
printf '   生成物齐（%s 个文件：后端四件套 + AI 读写工具 + 三前端）\n' "${#PLANNED[@]}"

# ── 3. 编译 + 生成模块单测（roadmap S4：单测绿）────────────────────────────────
log "③ 编译 + 生成模块单测"
( cd Server-NestJS && npm run build >/dev/null )
( cd Server-NestJS && npm test --silent -- "$PLURAL" >/tmp/_c2b_jest.log 2>&1 ) || {
  cat /tmp/_c2b_jest.log; fail "生成模块单测未过"; }
grep -qE "Tests:.*[1-9][0-9]* passed" /tmp/_c2b_jest.log || { cat /tmp/_c2b_jest.log; fail "生成模块单测未跑出用例"; }
JEST_LINE="$(grep -E 'Tests:' /tmp/_c2b_jest.log | tail -1 | tr -s ' ')"
printf '   %s\n' "$JEST_LINE"

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

# ── 5. 「天生可治理」断言（S5：与 Build 快在**同一次运行**里一起证明）────────────
# 生成物不是「裸 CRUD」——写工具自带确认门控 + 邮箱验证门，且其单测**断言了**该门控（声明即受测），
# 读工具无门控（自动放行），模块已接线进 ai.module（工具真注册）。全部机器可验，非散文声称。
log "⑤ 天生可治理：生成物自带治理（非事后补）"
WRITE_TOOL="$(printf '%s\n' "${PLANNED[@]}" | grep -E '/ai/tools/create-.*\.tool\.ts$' | head -1)"
READ_TOOL="$(printf '%s\n' "${PLANNED[@]}" | grep -E '/ai/tools/query-.*\.tool\.ts$' | head -1)"
[ -n "$WRITE_TOOL" ] && [ -n "$READ_TOOL" ] || fail "生成清单缺 AI 读写工具"

grep -qE 'requiresConfirmation = true' "$WRITE_TOOL" || fail "写工具未声明 requiresConfirmation（生成即带治理被破坏）"
grep -qE 'requireVerifiedEmail' "$WRITE_TOOL" || fail "写工具未声明 requireVerifiedEmail 门（HS-2）"
WRITE_SPEC="${WRITE_TOOL%.ts}.spec.ts"
[ -f "$WRITE_SPEC" ] || fail "写工具缺单测（治理声明未受测）"
grep -qE 'requiresConfirmation\)\.toBe\(true\)' "$WRITE_SPEC" || fail "写工具单测未断言确认门控"
if grep -qE 'requiresConfirmation' "$READ_TOOL"; then fail "读工具不应声明确认门控（应自动放行）"; fi
grep -q "'\.\./$PLURAL/$PLURAL\.module'" Server-NestJS/src/ai/ai.module.ts \
  || fail "生成模块未接线进 ai.module（AI 工具未注册）"

printf '   写工具 %s：requiresConfirmation=true + requireVerifiedEmail ✓（其单测已断言）\n' "$(basename "$WRITE_TOOL")"
printf '   读工具 %s：无确认门控（自动放行）✓；模块已接线 ai.module ✓\n' "$(basename "$READ_TOOL")"

rm -f /tmp/_c2b_jest.log
printf '\n═══ S4+S5 全链路验收：PASS ═══\n'
printf '  Build 快：访谈产物 →（确定性映射）→ 生成 %s 文件 → 编译 → 单测 %s\n' \
  "${#PLANNED[@]}" "$(printf '%s' "$JEST_LINE" | sed 's/^ *//')"
printf '  天生可治理：写工具确认门控 + 邮箱验证门（单测断言）· 读工具自动放行 · 已注册 · 迁移自洽\n'
printf '  两主张一次运行同证（Spec→Run 证据，§internal.6 Enterprise Proof 出口判据）\n'
