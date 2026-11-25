# R-6 — the third bucket gets its own line (2026-11-25) / R-6 · 第三个桶自成一态（2026-11-25）

Worktree `goofy-antonelli-e7ddc7`, branch `claude/goofy-antonelli-e7ddc7`, based on `e8f07a0f` (main).

## What changed / 改了什么

**`Server-NestJS/src/governance-shared/services/write-claim-decision.service.ts`**

- Constructor: optional injection of `TARGET_STATUS_PROBE` (`@Optional() @Inject(...)`, the same token
  and the same degradation as `WriteClaimQueryService`).
- `_askable(toolName)` (new): `boolean | null` — `null` when this process has no probe, because
  "we cannot tell" is a fact about the wiring, not about the tool.
- `_releaseEvidence` now takes `{idempotencyKey, toolName}` and returns
  `{lookupCount, askable, releaseLookups}`; the JSON gains `askable` beside `count`.
- `_lookupPhrase(evidence)`: three cases, not two — `lookups: N asked (see releaseLookups)`;
  `lookups: none (not askable — this tool has no usable status query)`; `lookups: none (never queried)`.
- `_detail` / `_targetDetail` take the evidence object; new `ReleaseEvidence` interface is the single
  shape shared by the prose and the column.

**`.../write-claim-decision.service.spec.ts`** — four R-6 cases (not askable; askable but never asked;
probe absent ⇒ `askable: null`; asked-N wins over current askability) and the existing zero-count
expectation now includes `askable: null`.

**Docs** — `CLAUDE.md` §9 release-endpoint row and `docs/revoke-contract.spec.md` (EN + ZH) now state
the three phrases and the `askable` field.

**Contract** — none. `releaseLookups` is an opaque JSON string in `ai-audit-log-row` v8; its internal
shape is declared producer-owned by `ai-audit-log-release-evidence-v1-vector.json`, so `askable` is an
additive producer-side field. Nothing to unblock; the run stopped nowhere.

## Why / 为什么

`canAsk` was held only by the read side (`reconcilable` on the in-flight list). The decision row — the
one that outlives the hold — could not tell "could have asked, did not" from "cannot ask at all", and
both were written as `never queried`. R-6 moves that same fact onto the write path.

## Acceptance / 判据怎么满足的

- A release on a tool with no usable status query reads "not askable", not "never queried" — pinned by
  the first R-6 case (phrase asserted both ways).
- The off-chain column carries the same fact: `{count, askable, items:[...]}`, so asked-N /
  askable-but-never-asked / not-askable are three countable states.
- No schema change, no new audit action, no migration.

## Commands and readings / 跑过的命令与读数

- `npx jest src/governance-shared/services/write-claim-decision.service.spec.ts` — **16/16**.
- `npx jest src/governance-shared/services src/ai/proxy/target-status.spec.ts src/app-wiring.spec.ts` —
  **36 suites / 513 tests, all green** (includes the R-3 `target-status-reconcile` spec and DI wiring).
- `npm run build` — pass. `npm run lint` — **0 errors** (88 pre-existing warnings).
- `npm run check:all` — **34/36**. Both reds are worktree-path artifacts, not this change:
  `check:coverage-gaps` and `check:java-vectors` resolve a sibling `KeelBase4J` next to the worktree
  (`D:\Rain6fish\KeelBase\.claude\worktrees\KeelBase4J`), which does not exist. Re-run with
  `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J`: both **green** (coverage gaps 14 entries consistent;
  vectors + schemas 13/13 and 225/225 byte-identical). `check:contract-release-gate` was green in this
  run.

## Not done / risks / 未做与遗留

- **F-123** (adding the reading row's id to each `releaseLookups.items` entry) was named as
  "can land with R-6" in the roadmap but is outside this item's acceptance; not included.
- The independent review of R-2/R-3 (`handoff/r2r3-review-1124.md` §九.1) noted that a target-driven
  release with `count = 0` (evidence insert swallowed) would say "target answered" and "never queried"
  together. R-6 does not change that branch: with the probe present `askable` is true there, so the
  phase stays "never queried". Left as-is; a distinct "not recorded" wording for that branch is a
  separate follow-up.
- Degraded assembly (no probe): `askable: null`, wording stays "never queried" (count-true). Production
  `AiModule` binds the probe.
- Full e2e suite not run (not requested); no push, tag or release performed; contract repo untouched.
