# R-1 — a lookup records what its answer is based on

**Status 2026-11-24: implemented and verified, not pushed, not on `main`.** The decision D69 ("unfreeze, do it") scopes this to exactly one column: `ai_target_status_lookups.basis`.

**Delivered commit:** `712e91e4` — `feat(audit): a lookup records what its answer is based on`. It sits on `save/r1-basis-1124` (parent `cf315eb8`) and, as of this report, is also the tip of this session's branch `claude/nostalgic-easley-bc32d2` (worktree `nostalgic-easley-bc32d2`). This run did not author a second implementation: it found the earlier commit, re-verified it end to end here, and adopted it as the single deliverable (see §6).

## 1. What changed

| Area | Change |
|---|---|
| Column | `ai_target_status_lookups.basis varchar(16)`, **nullable, no default** |
| Migration | `Server-NestJS/src/migrations/1861000000000-AddTargetStatusLookupBasis.ts` — one `ADD COLUMN` per dialect, `down` drops it; registered as the exact substring `*AddTargetStatusLookupBasis*` in `src/config/postgres-migrations.ts` |
| Vocabulary | `governance-core/target-status.ts`: `TARGET_STATUS_BASIS` (`current_state` / `receipt`), `TargetStatusBasis`, and the lookup's `basis: TargetStatusBasis \| null` |
| Write side | `ai/proxy/target-status.ts` reads the optional `body.basis`; only the two known words are recorded, everything else (absent, unknown value, non-string) is `null`; every `unanswered()` path carries `null`; nothing is inferred from `queryMethod` / `queryPath` |
| Persistence | `governance-shared/services/ai-tool-effects.service.ts` `_recordLookup` stores `basis` |
| Read face | `write-claim-query.service.ts` `projectLookup` maps `null → 'unknown'`; `TargetStatusLookupView.basis` is never `null`; the in-flight list's `lastLookup` inherits it |
| Release evidence | `write-claim-decision.service.ts` `_releaseEvidence` writes `basis` per item (`null → 'unknown'`) |
| Console | `Web-Admin-Vue` — a basis column in the history dialog, the kind on the in-flight row, a hint stating that a current-state reading cannot establish "never accepted"; i18n keys in `zh.ts` / `en.ts` |
| Docs | `docs/ai-agent.spec.md` AW-17 read face (EN+ZH), `docs/revoke-contract.spec.md` release-evidence item shape, `CLAUDE.md` endpoint row, `docs/manual/ai-bridge*.md` |

**Not done, by decision:** no contract change (the lookup table and `/claims/:id/lookups` are not in `keelbase-contract`; `releaseLookups` is an opaque string), no Java work (`KeelBase4J` has no such surface), no backfill, no column default, no index, and the kind is **not** a retry gate.

## 2. The five reverse criteria, each pinned by a test and probed for red

| # | Criterion | Test | Negative probe actually run → result |
|---|---|---|---|
| 1 | Two `not_executed` rows differing only in `basis` are distinguishable on the read face | `write-claim-query.service.spec.ts` — three rows (`receipt` / `current_state` / legacy) map to three distinct `basis` values | removed the `l.basis ?? 'unknown'` mapping in `projectLookup` → **1 failed, 25 passed** |
| 2 | A `NULL` row reads `unknown`, never `current_state`; no backfill | migration spec `**不回填**` + the same read-face case | added `UPDATE ... SET "basis" = 'current_state'` to `up()` → **1 failed, 4 passed** |
| 3 | Write side records `receipt` / `NULL` / `NULL` (never silently `receipt`) | `ai/proxy/target-status.spec.ts` — `{status, basis:'receipt'}`, no `basis`, `basis:'event_log'`, `'RECEIPT'`, `42`, an object | made `declaredBasis` fall through to `'receipt'` → **1 failed, 14 passed** |
| 4 | The kind is a label, not a gate — `not_executed` releases even with `basis` unknown | `target-status-reconcile.spec.ts` `R-1 反向：种类未记录（null）不得阻止收敛` | gated convergence on `evidence.basis === 'receipt'` → **9 failed, 15 passed** |
| 5 | The release row carries `releaseLookups.items[*].basis` | `write-claim-decision.service.spec.ts` — two same-conclusion readings read back as `['unknown','receipt']` | replaced the mapped value with a constant `'unknown'` in `_releaseEvidence` → **1 failed, 11 passed** |

All probes were reverted; `git status --porcelain` is empty afterwards.

## 3. Verification readings (all run in this worktree)

- Targeted specs: **86/86** across 6 suites (proxy, query, decision, reconcile, migration spec, postgres-glob guard).
- `npx tsc -p tsconfig.build.json --noEmit`: **0 errors**.
- sqlite: full migration chain from an empty DB (**118** migrations executed) then `migration:generate` → **"No changes in database schema were found"**.
- Postgres (throwaway `pgvector/pgvector:pg17` container, removed afterwards): full chain (**103** migrations), `migration:generate` → **"No changes"**; column shape read back as `basis | character varying | 16 | YES | (no default)`.
- `test/audit-reader-scope.e2e-spec.ts`: **19/19** (includes the exact key-set whitelist now listing `basis`, and the in-flight `lastLookup.basis` reading).
- Console: `vitest run src/views/ai-tools/__tests__/AiToolsView.spec.ts` → **20/20**; `vue-tsc --noEmit` → clean.
- `npm run check:all` (with `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J` and the contract submodule restored to its recorded pin `015f474`): **35/36**, the only red being `check:contract-release-gate` (C1 pin not reachable from the remote / C2 README-tag), the known baseline. No new red.
  - Environment note: this worktree's contract submodule was uninitialized and the pinned commit is not reachable from the submodule's remote. It was initialized and the pin restored by fetching from the main checkout's submodule (local, no push). The contract tags were fetched the same way so `check:contract-matrix` could read the pin's newest tag.

## 4. Boundaries observed

- No contract repository change, no contract vector change, no Java change.
- The freeze is honoured in scope: one column, nothing else added; no index, no default, no backfill, no new action, no new enum on the wire.
- The kind does not alter `conclusion` and does not change convergence: `not_executed` still releases and re-opens retry.
- Old rows stay `NULL`; the read face renders `unknown`; nothing is written into history.

## 5. What is deliberately not on `main`

A pre-push session holds tonight's push to `main` and asked that `main` stay clean and that R-1 not ride tonight's push. This report therefore lives on the R-1 branch, not in the main checkout. **Landing path:** after tonight's push, merge `save/r1-basis-1124` (== `712e91e4`, tree-identical to this session's branch tip) into `main`, then copy this report along with it.

## 6. Duplicate-work note

An earlier run of this task had committed the implementation as `712e91e4` onto `main` and then reset `main` back to `cf315eb8` (13:38:18), leaving the commit on `save/r1-basis-1124`. This run independently re-derived the change before discovering that commit. It compared both, found the saved commit complete against this task's checklist (including `CLAUDE.md`, the manual pages and the audit-entity comment, which the re-derivation did not yet have), and adopted it rather than shipping a second variant. The incomplete re-derivation is preserved outside the repository at `side-session-notes/…/r1-duplicate-draft-1124/` (patch + the two new files) purely for reference; it carries no unique value and should not be landed.

---

# R-1 —— 查询证据记下答案基于什么（中文）

**2026-11-24 状态：已实现、已实测，未推送、不在 `main`。** 裁定 D69（「解冻，照做」）把范围锁在一列：`ai_target_status_lookups.basis`。

**交付提交：** `712e91e4`（`feat(audit): a lookup records what its answer is based on`），位于 `save/r1-basis-1124`（父提交 `cf315eb8`），并已作为本会话分支 `claude/nostalgic-easley-bc32d2` 的顶端。本次运行没有另写第二份实现：它找到该提交、在这里端到端复验，并采纳为唯一交付（见 §6）。

## 1. 改了什么

- **列**：`basis varchar(16)`，可空、**无默认**。
- **迁移**：`1861000000000-AddTargetStatusLookupBasis.ts`，双方言各一条 `ADD COLUMN`，`down` 删列；在 `postgres-migrations.ts` 以精确子串 `*AddTargetStatusLookupBasis*` 注册（既有 `*AddTargetStatusLookups*` 不匹配本名）。
- **词表**：`TARGET_STATUS_BASIS`（`current_state` / `receipt`）、`TargetStatusBasis`，查询结果带 `basis: TargetStatusBasis | null`。
- **写入侧**：探针读可选的 `body.basis`，只记两个认得的词；缺席、认不出的值、非字符串一律 `null`；每条 `unanswered()` 出口都带 `null`；**不**从 `queryMethod` / `queryPath` 反推。
- **落库 / 读面 / 导出**：`_recordLookup` 落库；`projectLookup` 把 `null` 映成 `'unknown'`（这一面永不给 `null`），在途 `lastLookup` 继承；`_releaseEvidence` 每条读数带 `basis`（`null → 'unknown'`）。
- **控制台**：历史弹窗加「读数种类」列，在途行显示种类；对当前状态 / 未记录附一句「这条读数说的是现在没有，不是从未被接受」；i18n 走 `zh.ts` / `en.ts`。
- **文档**：`docs/ai-agent.spec.md` 的 AW-17 读面（中英）、`docs/revoke-contract.spec.md` 的释放证据条目形状、`CLAUDE.md` 端点行、`docs/manual/ai-bridge*.md`。

**有意不做**：不改契约（查询表与 `/claims/:id/lookups` 不在契约仓；`releaseLookups` 是不透明字符串）；Java 线零改动（4J 无此面）；不回填、不设默认、不加索引；种类**不是**重试闸。

## 2. 五条反向判据（每条都有测试，并实测反证）

| # | 判据 | 反证实跑结果 |
|---|---|---|
| 1 | 两条仅种类不同的 `not_executed` 读面可区分 | 删掉 `projectLookup` 的映射 ⇒ **1 红 / 25 绿** |
| 2 | `NULL` 旧行读 `unknown`，不回填 | 在 `up()` 加回填 `UPDATE` ⇒ **1 红 / 4 绿** |
| 3 | 写入侧诚实：`receipt` / `NULL` / `NULL` | 让 `declaredBasis` 回落成 `'receipt'` ⇒ **1 红 / 14 绿** |
| 4 | 种类不是闸 | 把收敛条件改成要求 `receipt` ⇒ **9 红 / 15 绿** |
| 5 | 释放行带 `releaseLookups.items[*].basis` | 把该值写死成 `'unknown'` ⇒ **1 红 / 11 绿** |

反证均已还原，`git status --porcelain` 为空。

## 3. 实测读数（全部在本 worktree 真跑）

- 定向 spec **86/86**（6 套）；`tsc -p tsconfig.build.json --noEmit` **0 error**。
- sqlite：空库跑完整迁移链 **118** 条，`migration:generate` ⇒ **No changes**。
- Postgres（一次性 `pgvector/pgvector:pg17` 容器，验完删除）：完整链 **103** 条，`migration:generate` ⇒ **No changes**；列形态回读 `basis | character varying | 16 | YES | 无默认`。
- `audit-reader-scope` e2e **19/19**（含键集白名单新增 `basis`、在途 `lastLookup.basis`）。
- 控制台 `AiToolsView` **20/20**；`vue-tsc --noEmit` 干净。
- `npm run check:all`（`KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J`，契约子模块已按 pin `015f474` 检出）：**35/36**，唯一红 `check:contract-release-gate`（C1 / C2），与基线一致，**无新增红**。

## 4. 边界

一列、无索引、无默认、不回填、不新增动作、不改契约、不动 Java；种类不改结论、不改收敛；旧行保持 `NULL`、读作 `unknown`。

## 5. 为什么不在 `main`

预推会话要求今晚推送前 `main` 保持干净、R-1 不随今晚推送。本报告因此留在 R-1 分支上。**落地路径**：今晚推送后，把 `save/r1-basis-1124`（即 `712e91e4`，与本会话分支树等价）并入 `main`，同时带上本报告。

## 6. 重复工作说明

本任务的早前一次运行把实现提交到 `main`（`712e91e4`），随后于 13:38:18 把 `main` 复位到 `cf315eb8`，提交留在 `save/r1-basis-1124`。本次运行在发现该提交前独立重做了一遍；比对后确认该提交对照任务清单完整（且多出 `CLAUDE.md`、手册页与审计实体注释三处本次尚未做的改动），故采纳它，不再交付第二套实现。未完成的重做稿保存在仓外 `side-session-notes/…/r1-duplicate-draft-1124/`（补丁 + 两个新文件），仅作留档，不应被合入。
