# R-5 — split the freshness clock from the decision clock (2026-11-25) / 把「读数新鲜度」与「决策年龄」拆成两只时钟（2026-11-25）

## What changed / 改了什么

**Pure core helper.** `Server-NestJS/src/governance-core/claim-clocks.ts` (new) reads both clocks at
one instant. Freshness is the existing F-79 schedule's `nextDueAt`; the decision clock starts when
the in-flight window closed (`claimedAt + REVOKE_STALE_MINUTES`) and is judged against a new bound
(`CLAIM_DECISION_BOUND_MINUTES`, default 1440). `escalation` is typed `'reask' | 'person'` — there is
no release value, which is the structural form of "an unknown clock never releases".
`claimDecisionBoundMinutes()` resolves the bound with the same fallback idiom as
`claimReconcilePassCap` (unreadable ⇒ default, never 0).

**Read surface.** `write-claim-query.service.ts`: `list()` resolves the bound once per page
(`:186`), `project()` calls `claimClocks` (`:379`) and the row now carries `readingStale` /
`readingStaleSince` / `decisionPendingSince` / `decisionAgeMinutes` / `decisionOverdue` /
`escalation` (`:427-432`); the page carries `decisionBoundMinutes` (`:207`). The `ORDER BY
claimedAt ASC` is unchanged and is the decision clock spelled literally: the decision start is a
fixed offset from `claimedAt`, so a re-ask can never reorder the queue. That relationship is stated in
`ordering.ts` and in the code comment at the `ORDER BY`.

**Config.** `env.config.ts` + `.env.example`: `CLAIM_DECISION_BOUND_MINUTES` (default 1440).

**Console.** `AiToolsView.vue`: an escalation filter and a freshness checkbox (`:93`, `:100`), a
`visibleClaims` computed (`:485`), a new "two clocks" column rendering both sentences and badges
(`:128`), and the page hint carrying the bound. `types/admin.ts` gains the six row fields plus
`decisionBoundMinutes`. `zh.ts` / `en.ts` gain nine keys each.

**Docs.** `CLAUDE.md` §9's claims row and §6.1's env list; `docs/revoke-contract.spec.md` gains an
R-5 paragraph in both language blocks.

## Why / 为什么

The pending-decision queue was driven by claim age alone, so "the latest reading is old, ask the
target again" and "the decision has been open too long, a person must decide" looked identical.
Both facts already existed (`lastLookup`, `autoReconcileDueAt`), so the fix is read-surface semantics,
not schema.

## How the criteria were met / 判据怎么验的

- **Two clocks, visible on the row.** Every queued row carries `decisionPendingSince` /
  `decisionAgeMinutes` / `decisionOverdue` and `readingStale` / `readingStaleSince`; the console
  renders "决策从 X 起待裁 · 已 N 分钟" and "读数从 X 起陈旧" with the matching badge.
- **Re-ask vs person.** `escalation` is `reask` when only freshness expired, `person` when the
  decision is overdue (and when both expired — the sweep re-asks on its own; the overdue decision is
  what needs a person).
- **Decision age is the stable key.** Spec "稳定键" case: re-asking the oldest row refreshes
  `readingStale` to false and leaves the row order and `decisionPendingSince` unchanged.
- **Never release on the unknown clock.** `ClaimEscalation` has no release member; the spec case
  "未知读数过了重问点仍不能释放" pins that a row whose `unknown` reading is past its re-ask point
  still reports `escalation: 'reask'`, stays `claimed` / `awaiting_decision`, and remains in the list.
- **Freshness is a filter and a badge.** Console: "只看读数陈旧" checkbox (orthogonal to the
  escalation filter) plus the per-row badge.

## Commands and readings / 命令与读数

- `npx jest src/governance-core/claim-clocks.spec.ts src/governance-shared/services/write-claim-query.service.spec.ts src/governance-core/purity.spec.ts --forceExit`
  → **50/50** tests, 3 suites.
- `npx jest src/governance-shared src/governance-core src/maintenance-tasks --forceExit`
  → **46/46 suites, 605/605 tests**.
- `npx tsc --noEmit -p tsconfig.build.json` → **0 errors**. (A bare `tsc --noEmit` reports
  pre-existing errors confined to specs/e2e files; none of the touched files appear.)
- `NODE_ENV=test npx jest --config ./test/jest-e2e.json test/audit-reader-scope.e2e-spec.ts --forceExit`
  → **19/19** (the updated field-set assertion included).
- `Web-Admin-Vue`: `npm run typecheck` → **0 errors**; `npx vitest run src/views/ai-tools`
  → **21/21**; ESLint on touched console files → **0 errors** (14 pre-existing stub warnings).
- ESLint on touched backend files → **0 findings**.
- `npm run check:all` → **34/36** in this worktree. The two reds are `check:coverage-gaps` and
  `check:java-vectors`, both because they look for a sibling `KeelBase4J` at
  `<worktree>/../KeelBase4J`. Re-run with `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J`:
  both green (gaps aligned **14**; vectors **13/13**, schemas **225/225**) ⇒ effectively **36/36**.
  `check:contract-release-gate` was green (no contract pin moved).
- The contract submodule was uninitialised in this worktree; before initialising it, 9 tests in
  6 suites failed on `ENOENT … specs/protocol/…`. Initialised with
  `git -c protocol.file.allow=always submodule update --init Server-NestJS/specs/protocol`
  (pinned `015f474`, v1.23.0). Those failures were environmental, not from this change.

## Not done / boundaries / 未做与边界

- **No schema / column / migration change.** All new readings are computed from rows that already
  exist plus the existing schedule resolver.
- **The freshness filter is applied to the current page in the console**, not in SQL: ordering the
  filter server-side would need per-row schedule arithmetic that is not portable between SQLite and
  Postgres. The API still returns the full page in decision-age order and carries the fields, so a
  later server-side filter is additive.
- **The ordering declaration still says `claimedAt`** because that is the expression the query
  executes; the decision-age meaning is documented next to it and in the response fields. Changing
  the declaration to a different field name would make it describe something the query does not run.
- No full `npm run test:e2e` run and no coverage run were made (both are outside `check:all`); the
  targeted `audit-reader-scope.e2e-spec.ts` ran green, with its field-set assertion updated for the
  new keys.
- Unpushed, per the working-hours rule. R-4 / R-6 are separate sessions and were not touched.
