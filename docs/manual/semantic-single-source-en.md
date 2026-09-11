# Semantic Single-Source Rule (CE-1 C1)

> **Rule**: implementation changes that touch **tool / governance / audit / event** semantics must land alongside `specs/protocol` (vectors / golden samples) or `specs/protocol/schemas` (wire Schema) — i.e. **land the contract first, then the code**. This fights "the same semantic implemented in two places, drifting apart".

## Why

KeelBase's key capability is one Application Semantic Layer joining Build and Run (ADR-0002). When semantics live in two implementations (TS code + contract) they silently diverge — audit hash chain, R0-R5 risk tiers, business-event naming, wire Schema — and "cross-language reproducible" breaks. The single-source rule makes this a **machine-checkable discipline** (CE-1 role ②: the capability-evolution arbitration bridge).

## Semantic sources (changes need a companion contract change)

| Semantic source | Semantics |
|---|---|
| `Server-NestJS/src/common/audit-chain/` | canonical JSON / hash chain / HMAC algorithm |
| `Server-NestJS/src/common/wire-schema/` | wire Schema (SSE / confirmation / trace / side-effect / audit payload…) |
| `Server-NestJS/src/ai/interfaces/tool.interface.ts` | R0-R5 risk tiers + strategy table |
| `Server-NestJS/src/ai/audit/ai-business-event.ts` | business-event naming |

**Contract sources** (any change here satisfies the rule): `Server-NestJS/specs/protocol/` (vectors / golden samples / registry), `Server-NestJS/specs/protocol/schemas/` (wire Schema v1).

## Workflow

1. Change semantics (files above) → **first** update `specs/protocol` vectors/golden or `schemas` wire Schema, **in the same batch**.
2. Pure refactor / comments / no contract impact → add the `[no-semantic-change]` trailer to the commit message (reason visible to reviewers).
3. Gate verdict: semantic source hit with no contract change → fail; exemption trailer present → pass.

## Machine gate

```bash
cd Server-NestJS
npm run check:semantic-single-source --base origin/master   # diff base...HEAD
npm run check:semantic-single-source --files "a.ts b.json"  # explicit files (testing)
npm run check:semantic-single-source --list                 # print source/contract lists
```

- No usable base (first push / shallow clone) → skip, no false positives.
- CI: `semantic-guard` job (**hard gate**: red without a same-batch contract change; pure refactors exempt via the `[no-semantic-change]` trailer). No usable diff base (first push/shallow) → the script skips itself.

## Related

- B1 vector corpus / B2 canonical golden samples (`generate --check` CI drift gate) / B3 wire Schema v1 freeze — this gate is their **process side** (who lands first); B1/B2/B3 are the **artifact side** (what lands).
- C2 terminology single-source (`check-protocol-language.mjs`) governs **external wording**; this gate governs **implementation ↔ contract**.
- **Reviewer checklist (companion)**: [semantic-change-checklist.md](semantic-change-checklist.md) — turns this rule into a per-face mapping (semantic face → artifact to sync → gate command → reviewer checkbox). This file is the **rule source**; the checklist is its operational face — no second rule statement.

## Scope notes

- The semantic-source list is **conservative** (high signal, under-report): changes outside it are not flagged. Extend by adding a line to `SEMANTIC_SOURCES` in `scripts/check-semantic-single-source.mjs`.
- The exemption trailer must be **visible** in the commit message (reviewers can recheck; no silent bypass).
