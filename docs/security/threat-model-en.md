# KeelBase Threat Model & Trust Boundaries

> Purpose: turn "what KeelBase protects, with which mechanisms, and what it does **not** protect" into a reviewable **threat model + trust boundary statement** for enterprise security review, POC evaluation, and audit liaison.
> Consistent with [SECURITY.md](../../SECURITY.md) "Trust Boundaries — Not-a-*": **N-1/N-2/N-3 are the source of this document's boundaries** — this page only details threats → controls → residual risks, adding no new promises.
> 中文版：[threat-model.md](threat-model.md)

---

## 1. Trust Boundary Statement

One-line boundary: **KeelBase's audit-integrity guarantee holds within the application boundary and assumes the signing key is not leaked; it is not a DBA/root-proof fortress, nor a non-repudiable store.** Concretely (N-1/N-2/N-3):

| Boundary | Promised | Not promised |
|---|---|---|
| **Tamper detection scope** | Out-of-band DB writes that bypass the formal write path break the audit hash chain and are detected by `/audit/verify` / `/audit/operations/verify`; the evidence root (`keelbase-audit-evidence/3`) binds the auth snapshot + Decision Evidence + per-chain rows into one file whose root digest is reproducible offline | Not a defense against an attacker who simultaneously controls the database **and** the runtime signing key (same trust domain) (N-1) — mitigated by deployment discipline (key separation, DB least privilege, audit on a separate governance DB), see §4 |
| **Nature of evidence** | Hash chain + evidence package + offline verification are **integrity evidence** (records provably unmodified/unomitted since write; evidence strongly correlated) | Not a legal/regulatory "non-repudiable store"; legal-grade forensics additionally requires external notarization / trusted timestamping / key custody (N-2, deployment duty) |
| **Audit coverage** | Every write path inside the system: REST / AI tools / MCP / Bridge / SSE / governance callbacks | Not direct DB modifications bypassing formal paths (N-10), nor an admin with host root plus equivalent application-side privileges (N-3) |

**Why this boundary**: every application-layer anti-tamper scheme has a trust root. KeelBase's root = "the formal write path + the audit key are not controlled by the same attacker." Stating it lets enterprises arrange external controls (OS/DB access control, key custody, separation of duties) instead of assuming a Runtime alone grants non-repudiation.

---

## 2. Assets & Trust Domains

| Asset | Location | Trust domain |
|---|---|---|
| Business data | Business DB (SQLite/PostgreSQL) | App process + DB in one domain (deployer-controlled) |
| AI/operation audit + hash chain | `ai_audit_logs`/`operation_audit_logs` in business DB | Same business DB; production should keep the audit key separate |
| Governance policy | Dedicated policy table / Governance Console | App domain; can be split to a separate governance DB (`GOVERNANCE_DB_*`) |
| Audit evidence package / evidence root | Exported file (JSON) | Held by the verifier after leaving the system (offline) |
| Signing key (AUDIT_HMAC_KEY etc.) | Env var / key custody | **Trust root** — leaking it invalidates the N-1 boundary; protected by deployment discipline |

**Trust-root summary**: the offline verifier `verify-evidence.mjs` depends only on Node built-ins and needs no KeelBase install to re-check an evidence package — this pushes "whom the auditor must trust" from "the running Runtime process" down to "the evidence package itself + the verification algorithm," which is exactly the N-1 "push the single point of trust down" idea.

---

## 3. Threat Model (Threat × Control × Residual Risk)

> Adversary classes: T0 anonymous external, T1 signed-in normal user, T2 over-privileged user (incl. a poisoned Agent), T3 internal operator/DBA with business-DB/host access, T4 key holder. Residual-risk column = duty the deployer must take over.

| Threat | Control | Coverage | Residual risk (deployer duty) |
|---|---|---|---|
| **T0–T2 unauthorized read/write** (cross-user/role, row-level bypass) | CASL row-level + PoliciesGuard + tool data-scope + AI eval/adversarial showcase | All in-system API & AI-tool paths | — (closed loop within app boundary) |
| **T1–T2 writes without confirmation** (agent self-writes, confirmation bypass) | R3 confirm / R4 approval / R5 block; one-time confirm token; SSE confirmation protocol | AI write-tool paths | Humans must review a diff summary, not blind-batch (batch semantics: N-7 / KB-5) |
| **T0–T2 injection** (prompt injection, tool-abuse redirection) | Tool allowlist + injection defenses + security-showcase scenarios + eval injection cases | AI chat and tool execution | — |
| **T2–T3 audit tampering** (edit/delete/reorder/fake-consistent fields) | Hash chain (contiguous prev_hash) + write-path serialization lock + per-row `/verify` recompute | Audit rows produced via in-app write paths | **Whoever holds business DB + signing key can recompute the chain** (N-1): mitigated by key separation + DB least privilege + audit on a separate governance DB |
| **T3 direct DB edit** (bypass API to alter business data/audit) | — (application cannot stop a DB holder) | Not covered (N-10/N-3) | OS/DB access control, out-of-band change trails, audit/DB separation, backups |
| **T4 key leak & re-sign** | Key is not inside the package; offline verify needs external `--key` | Evidence integrity depends on key secrecy | Key custody/HSM, rotation, sound handling of retired keys (historical breaks need re-sign; done on ECS demo) |
| **Untrusted failure paths** (timeout/partial/replay/DB fault/compensation failure) | failure-path corpus (KB-4): idempotency, bounded timeout, audit fail-closed, honest unknown-result | Runtime write paths & external calls | Cross-system eventual consistency via enterprise reconciliation/compensation (N-6) |

**Core judgment**: KeelBase closes the T0/T1/T2 in-system threats within the app boundary, and hands T3/T4 (DB holder, root, key holder) explicitly to deployment discipline rather than fighting them with a cryptographic promise that can break. **That honesty is what a Trust Runtime should have** — a truly enterprise-grade system does not claim to stop everything.

---

## 4. Trust-Boundary Deployment Duties

For N-1/N-3 to hold in a real deployment, the deployer must (each missing item downgrades the boundary):

- [ ] **Separate audit keys**: AUDIT_HMAC_KEY / JWT secrets not shared into business-developer env; production uses key custody/env isolation
- [ ] **DB least privilege**: app account has no DDL; audit tables not directly writable outside the app
- [ ] **Separate audit DB** (optional hardening): configure `GOVERNANCE_DB_*` so governance/audit lands in a separate governance DB, split from the business DB (§2 trust domain)
- [ ] **Out-of-band change discipline**: any DBA change bypassing the API goes through a change process with an external trail, so it stays attributable
- [ ] **Backup/restore drills**: restore keeps the original hash chain and key versions, or post-restore verification fails (a retired-key break already occurred; see evidence hub)
- [ ] Legal-grade forensics additionally needs **external notarization / trusted timestamping / key custody** (N-2)

---

## 5. How Audit Integrity Is Proved (Reproducible Verification)

Three evidence layers (L0/L1/L2, see [docs/evidence](../../docs/evidence/README.md)); everything is live-checkable or offline-reproducible:

```bash
# L0 runtime integrity (admin token, recompute live)
GET /api/v1/audit/verify                    # AI audit hash chain, per-row recompute
GET /api/v1/audit/operations/verify         # operation audit hash chain
GET /api/v1/ai/governance/evidence-root/:resultType/:resultId   # single-action cross-chain evidence root v3

# L1 offline independent review (auditor/third party, no KeelBase install; Node built-ins only)
#   after exporting an evidence package, in Server-NestJS/:
npm run verify:evidence -- <evidence.json>          # structure: contiguous seq / 64-hex hashes / contiguous prevHash / self-consistent root digest
npm run verify:evidence -- <evidence.json> --key <AUDIT_HMAC_KEY[,PREVIOUS...]>   # full recompute of every payload + root anchor + signature
```

- **Why offline review works**: `verify-evidence.mjs` implements the protocol algorithms independently (canonicalJSON + HMAC-SHA256 + sha256 root anchor) — it imports no reference implementation and is environment-independent.
- **Evidence root v3 answers "where is the chain anchored"**: the single-action evidence root binds the auth snapshot (incl. policy.revision) + Decision Evidence + same-conversation AI audit-chain rows + operation_audit chain rows + side-effect rows into one file; `root.anchors` (cross-chain) + `root.digest` are reproducible offline — an auditor does not have to trust the running system; with the exported package they can verify "under what authorization that AI action happened, what it changed, and which chain it landed on."
- **Existing archived sample**: `Server-NestJS/docs/benchmark/evidence-verify-*.json/.md` (offline verification reports with full-recompute PASS records).

---

## 6. Relationship to Not-a-* and Follow-on Docs

- Source boundary table: [SECURITY.md → Trust Boundaries (Not-a-*)](../../SECURITY.md); N-1/N-2/N-3/N-6/N-7/N-10 map one-to-one to this document
- Hash chain spec: `docs/hs11-audit-chain.spec.md`
- Authorization snapshot: `docs/audit-authz-snapshot.spec.md`
- Evidence root: `docs/evidence-root.spec.md`; evidence overview: `docs/evidence/README.md`
- Failure-path trustworthiness: `docs/failure-path-corpus.spec.md` (KB-4)
- This model is revised as capabilities evolve; run new "we provide / we do not" statements through §1 boundaries first.

*Document · 2026-09-07 · KB-3 threat model + trust boundary (aligned to N-1/N-2/N-3)*
