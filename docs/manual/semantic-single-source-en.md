# Semantic Single-Source Rule (CE-1 C1)

> **Rule**: implementation changes that touch **tool / governance / audit / event** semantics must land alongside the contract — i.e. **land the contract first, then the code**. This fights "the same semantic implemented in two places, drifting apart".

**Two forms of "landing the contract"** (they split when the contract left this repository on 2026-09-21):
- **Before the split**: edit the vectors / golden samples / schemas under `Server-NestJS/specs/protocol/` here;
- **After the split**: commit to the contract repository first, then **advance this repository's submodule pin in the same batch** (the bare path `Server-NestJS/specs/protocol`).

Why the pin is the only route after the split: it is the only contract action observable from here — and the sibling gate `contract-not-edited-here` **forbids** editing files under `specs/protocol/` in this repository.

## Why

KeelBase's key capability is one Application Semantic Layer joining Build and Run (ADR-0002). When semantics live in two implementations (TS code + contract) they silently diverge — audit hash chain, R0-R5 risk tiers, business-event naming, wire Schema — and "cross-language reproducible" breaks. The single-source rule makes this a **machine-checkable discipline** (CE-1 role ②: the capability-evolution arbitration bridge).

## Semantic sources (changes need a companion contract change)

| Semantic source | Semantics |
|---|---|
| `Server-NestJS/src/common/audit-chain/` | canonical JSON / hash chain / HMAC algorithm |
| `Server-NestJS/src/common/wire-schema/` | wire Schema (SSE / confirmation / trace / side-effect / audit payload…) |
| `Server-NestJS/src/ai/interfaces/tool.interface.ts` | R0-R5 risk tiers + strategy table |
| `Server-NestJS/src/ai/audit/ai-business-event.ts` | business-event naming |
| `Server-NestJS/src/governance-shared/services/revoke-class.ts` | revoke classes (KB-6 single source; re-exported by `tool.interface.ts`) |
| `Server-NestJS/src/governance-shared/services/audit.service.ts` | audit action/outcome vocabulary (frozen by `ai-audit-log-outcome-v1`) + chain write |
| `Server-NestJS/src/governance-shared/services/audit-evidence.service.ts` | `audit-evidence/2` and `/4` package formats + action report, whose schema names this file as its source |
| `Server-NestJS/src/governance-shared/services/effect-chain.ts` | side-effect chain canonical payload: which columns the contract's hash covers |
| `Server-NestJS/src/governance-shared/services/effect-composition.ts` | declared shape of a multi-table write: `ToolResult.data.effects[]` decides which rows share one compensation group |
| `Server-NestJS/src/governance-shared/services/effect-projection.ts` | API-visible effect `status` (four frozen values) + `revocable` |
| `Server-NestJS/src/governance-shared/services/effect-revoke.ts` | revoke state machine: the writes that set `revokeStatus` |
| `Server-NestJS/src/governance-shared/services/governance-policy.service.ts` | governance policy + gate modes (auto / confirm / approval) |
| `Server-NestJS/src/governance-shared/services/tool-metadata.ts` | single source of tool business-event names (the listed `ai-business-event.ts` derives from it) |

**Membership rule**: a file is listed only when it **owns** a semantic the contract records — a named vocabulary, a canonical payload or a wire shape. Readers, projections of already-recorded state, aggregators, label maps, parsers of persisted text, pure helpers and type re-exports stay out: changing them cannot require a contract change, and listing them would make ordinary refactors demand the exemption trailer. `governance-shared/services/` was swept file by file on 2026-10-25.

**Contract sources** (any hit satisfies the rule): the vectors / golden samples / registry / schemas under `Server-NestJS/specs/protocol/` (**pre-split form**), and **the submodule pin itself**, `Server-NestJS/specs/protocol` (**post-split form**, bare path, exact match).

## Workflow

1. Change semantics (files above) → **first** land the vectors / golden samples / schema in the contract repository, then **advance this repository's submodule pin**, **in the same batch** (before the split: edit the files under `specs/protocol/` directly).
2. Pure refactor / comments / no contract impact → add the `[no-semantic-change]` trailer to the commit message (reason visible to reviewers).
3. Gate verdict: semantic source hit with no contract change → fail; exemption trailer present → pass.

## Machine gate

```bash
cd Server-NestJS
npm run check:semantic-single-source --base origin/main   # diff base...HEAD
npm run check:semantic-single-source --files "a.ts b.json"  # explicit files (testing)
npm run check:semantic-single-source --list                 # print source/contract lists
```

- No usable base (first push / shallow clone) → skip, no false positives.
- Locally the `npm run` script also passes `--worktree`, so **uncommitted** (staged + unstaged) semantic-source edits count. Diffing `base...HEAD` alone leaves a just-edited source green locally while it turns CI red the moment it is committed. A working-tree hit **cannot** be exempted by the trailer — there is no commit to carry it — so commit (with the contract pin or the trailer) and re-run. CI does not pass the flag; its behaviour is unchanged.
- CI: `semantic-guard` job (**hard gate**: red without a same-batch contract change; pure refactors exempt via the `[no-semantic-change]` trailer). No usable diff base (first push/shallow) → the script skips itself.

## Related

- B1 vector corpus / B2 canonical golden samples (`generate --check` CI drift gate) / B3 wire Schema v1 freeze — this gate is their **process side** (who lands first); B1/B2/B3 are the **artifact side** (what lands).
- C2 terminology single-source (`check-protocol-language.mjs`) governs **external wording**; this gate governs **implementation ↔ contract**.
- **Reviewer checklist (companion)**: [semantic-change-checklist.md](semantic-change-checklist.md) — turns this rule into a per-face mapping (semantic face → artifact to sync → gate command → reviewer checkbox). This file is the **rule source**; the checklist is its operational face — no second rule statement.

## Scope notes

- The semantic-source list is **conservative** (high signal, under-report): changes outside it are not flagged. Extend by adding a line to `SEMANTIC_SOURCES` in `scripts/check-semantic-single-source.mjs`.
- The exemption trailer must be **visible** in the commit message (reviewers can recheck; no silent bypass).
- **Why the comment-only case is not auto-detected**: a JSDoc continuation line and a generator method line
  are lexically indistinguishable — both read as "a `*` followed by whitespace", and JSDoc continuations carry
  that space by convention. An auto-exemption keyed on the line prefix would silently pass a one-line code
  change of that shape (measured 2026-09-28: the predicate's positive case misclassified it immediately).
  Closing the hole means a hand-rolled block-comment state machine plus hunk-line-number parsing over two
  versions of each file, and it still leaves a string-literal corner. The exemption therefore stays an
  **explicit human declaration** (the trailer); the gate does not auto-decide.
