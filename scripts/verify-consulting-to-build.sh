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
# 出口的清理**只放回这一轮碰过的路径**（见 `cleanup()`）。注意：那道干净守卫是**进入时**查的，而一趟要跑
# 几分钟（build + jest + 两轮 typeorm）——期间别人落下的未提交改动，守卫**看不见**。所以清理**不能**用整树
# `git checkout -- .`：那会把那些改动一并抹掉，而且不留任何记录。（2026-10-07 实测：整树还原这样丢过两次
# 别人的在途改动，肇事者自己也认了；同一手法 2026-09-19 已被另一会话警告过一次。）
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

# `cleanup` 挂在 EXIT 上，**任何**退出路径都会跑到它（包括下面那道守卫的拒绝）⇒ 两个路径表在任何退出之
# 前先备好空默认值。**不要**在 cleanup 里用 `${arr[@]:-}`：空数组会因此产出一个**空字符串路径**，而 git
# 对空 pathspec 是**整体报错** ⇒ `|| true` 会把真正的还原一起吞掉（树留在改过的状态，还看不出来）。
PLANNED=()
WIRED_ARRAY=()
# 接线清单**从生成器取**（`wire.mjs` 自己导出的 `WIRED_FILES`），不在这里手抄：手抄的那份会漂移，而漂移的
# 后果是「跑完留下一棵改过的树」。取不到就**当场失败**——静默空表比失败难查得多。
mapfile -t WIRED_ARRAY < <(
  node --input-type=module -e \
    'import { WIRED_FILES } from "./scripts/generator/wire.mjs"; process.stdout.write(WIRED_FILES.join("\n"))' \
    2>/dev/null || true
)
[ "${#WIRED_ARRAY[@]}" -gt 0 ] || fail "取不到接线清单（scripts/generator/wire.mjs 的 WIRED_FILES）——本脚本靠它把这一轮的改动放回去"

# ── 0. 前置：干净工作树（生成段会写文件；脏则拒绝，防污染并行工作区）──────────────
if [ -n "$(git status --porcelain)" ]; then
  fail "工作树不干净——本脚本会生成文件，请在干净检出或临时 worktree 中运行（git worktree add --detach /tmp/c2b HEAD）"
fi
[ -f "$BS" ] || fail "Business Spec 不存在：$BS"

# 生成段产物的清理：**只放回这一轮碰过的路径**。
# tracked 的靠 `git checkout` 还原、untracked 的靠 `git clean` 清掉 —— **同一张路径表对两类都成立**
# （对 tracked 路径 clean 无操作，对 untracked 路径 checkout 报错而被 `|| true` 吞掉），
# 故这里只维护**一张表**：`PLANNED`（dry-run 列出的生成物，第 ② 步填）+ `WIRED`（接线清单，由生成器导出）
# + 本脚本自己产的那两件。
cleanup() {
  cd "$ROOT" 2>/dev/null || true
  local touched=("${PLANNED[@]}" "${WIRED_ARRAY[@]}" "$SPEC" "Server-NestJS/$DB")
  # `git ls-files` 先把表过滤成**已跟踪**那部分再 checkout：`git checkout` 碰到一个不存在的 pathspec 会
  # **整个中止**（2026-10-07 实测：连合法的那条也不还原），而这张表里既有 tracked 又有 untracked（`PLANNED`
  # 多是新文件）⇒ 不过滤就等于**什么都没还原**，还偏偏被 `|| true` 吞掉、看不出来。
  # `clean` 不需要这道过滤：它对不存在的路径与已跟踪的路径都是**安全无操作**（同批实测）。
  local tracked=()
  mapfile -t tracked < <(git ls-files -- "${touched[@]}" 2>/dev/null || true)
  [ "${#tracked[@]}" -gt 0 ] && git checkout -- "${tracked[@]}" >/dev/null 2>&1 || true
  git clean -fdq \
    "${touched[@]}" \
    "Server-NestJS/src/${PLURAL:-__none__}" \
    "Front-Flutter/lib/features/${PLURAL:-__none__}" \
    "Web-Admin-Vue/src/views/${PLURAL:-__none__}" \
    "Front-Taro/src/pages/${PLURAL:-__none__}" \
    >/dev/null 2>&1 || true
  # 生成物里**没有独立目录**的那几件（AI 工具 / 管理台 api / Taro 的 service·type·store / 本脚本的迁移）。
  # 未跟踪时靠 clean 清掉；**已被检进仓**时上面那句 `git checkout -- <这一轮的路径>` 已经还原过 —— 这里
  # **不能**再用 `rm -f`：它不认 tracked，会把仓库里的文件真删掉（2026-09-28 实测一次删掉 8 个，且 CI
  # 之外没人会察觉）。
  git clean -fdq -- \
    'Server-NestJS/src/ai/tools/query-*' 'Server-NestJS/src/ai/tools/create-*' \
    'Web-Admin-Vue/src/api/*' \
    'Front-Taro/src/services/*' 'Front-Taro/src/types/*' 'Front-Taro/src/stores/*' \
    'Server-NestJS/src/migrations/*_c2b*' >/dev/null 2>&1 || true
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

# `--force`：这条链现在**已经**把生成物检进仓（followup_plans 就是它自己的产物），而生成器对已存在的模块
# 默认拒绝覆盖 ⇒ 不带 force 会正好在这步失败。覆盖是安全的：生成段写过的 tracked 文件由 cleanup 按**这一轮的
# 路径表**原样还原，untracked 的按同一张表 clean。
node scripts/keelbase-init.mjs --spec "$SPEC" --force >/dev/null

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
# 语义：生成模块自带实体；迁移**可能已在仓里**（followup_plans 就是这条链自己的产物，其迁移已检进仓）⇒
#      首轮产出与否都算正常，真正的判据是下面那次复生成——
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
  ls src/migrations/*_c2b_gen* >/dev/null 2>&1 \
    || log "（首轮无新迁移：该模块的迁移已在仓里，符合预期）"
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
