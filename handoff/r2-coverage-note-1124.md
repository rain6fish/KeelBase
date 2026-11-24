# R-2 coverage statement on the lookup read surface (2026-11-24) / 查询证据读面的覆盖声明（2026-11-24）

## What changed / 改了什么

**Read surface.** `GET /ai/tool-effects/claims/:id/lookups` now carries `coverage`, computed when the
response is built:

- `basis`: `until-first-lookup` (a reading exists) or `no-lookups-yet` (none does).
- `unobservedSeconds`: the stretch from `claimedAt` to the first reading; with no reading, from
  `claimedAt` to the moment of this response. Never `null` — an empty history is a duration.
- `observedFrom`: the first reading's timestamp, or `null`.
- `expectedFirstAskAfterMinutes`: the plan's first wait (`CLAIM_RECONCILE_BACKOFF_MINUTES[0]`,
  default 60) read from the same `claimReconcilePlan` the hourly sweep uses — never a literal.

Nothing else on the wire changed: `seq` / `intervalSeconds` / `claimedAt` /
`firstLookupAfterWriteSeconds` keep their meaning, the list order is still newest-first, and no
column, migration, or sorting contract moved.

**Console.** The lookup-history dialog in `Web-Admin-Vue/src/views/ai-tools/AiToolsView.vue` renders
the same statement from the response: the pre-first-ask blind window with the schedule's expected
first ask, and a distinct sentence when no reading exists ("everything since the claim is
unobserved"). Both sentences live in the existing `zh` / `en` dictionaries; no Chinese is hardcoded.

**Docs.** `CLAUDE.md` §9's row for this endpoint states the new field and its read-time basis.

## How the criteria were verified / 判据怎么验的

Targeted spec: `Server-NestJS/src/governance-shared/services/write-claim-query.service.spec.ts`
(25/25 green), with the paired reverse reading:

- Claim written at `T`, first ask at `T+1h` ⇒ `coverage = {basis: 'until-first-lookup',
  unobservedSeconds: 3600, observedFrom: T+1h, expectedFirstAskAfterMinutes: 60}`.
- Same claim shape with `CLAIM_RECONCILE_BACKOFF_MINUTES='10,60,600,3600'` and first ask at
  `T+10m` ⇒ `unobservedSeconds: 600`, `expectedFirstAskAfterMinutes: 10` — the expected wait follows
  configuration, so the declaration is not a 60-minute literal.
- No readings, claimed 300 s ago ⇒ `basis: 'no-lookups-yet'`, `observedFrom: null`,
  `unobservedSeconds` in [300, 310), `firstLookupAfterWriteSeconds` still `null` (the old field's
  semantics are unchanged; only the declaration gives the duration).

Console spec: `Web-Admin-Vue/src/views/ai-tools/__tests__/AiToolsView.spec.ts` (20/20 green) asserts
the one-hour sentence and the no-reading sentence render in the dialog.

Other gates: `npx tsc -p tsconfig.build.json --noEmit` 0 errors; `npm run typecheck` (vue-tsc) 0
errors; ESLint on the touched backend files 0 findings. A bare `npx tsc --noEmit` still reports
pre-existing errors confined to `*.spec.ts` / `test/*.e2e-spec.ts` (none of the touched files appear
in that list); the build config is the project's source type gate.

## Not done / boundaries / 未做与边界

- **No export touched.** No existing export carries the lookup history, so nothing was added; no new
  export was invented. (The `claim_release` audit row's `release_lookups` is a decision-row column
  owned by R-3, not a lookup-history export.)
- **No schema / column / migration / sorting-contract change.** The declaration is computed at read
  time from rows that already exist plus the existing schedule resolver.
- **Files deliberately untouched:** `ai-tool-effects.service.ts` and
  `write-claim-decision.service.ts` (R-3 session).
- The console briefly keeps the previous claim's coverage while a new history request is in flight —
  the same behaviour the table already had; not changed here.
- Work happens in a worktree, unpushed, per the working-hours rule.
