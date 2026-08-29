# Security Showcase — a runnable security verification tour

> For reviewers: a **self-service** path to prove KeelBase's AI security model — for each capability: "what to run, what to look at, what to expect."
> Complements the internal [release-gate.md](release-gate.md) gate (PASS/FAIL) with a "how to run & what to see" guide.
> Coverage: permission denied / tool governance & risk tiers / human approval / audit hash chain / agent behavior baseline.
> [中文](security-showcase.md) · English

## 0. Start the environment (~2 min)

**Option A — single-container image (recommended, zero-config)**

```bash
docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
```

> Built-in **deterministic Demo Provider**: the full AI golden path (analyze → confirm → create → audit → revoke) works without any LLM key; add `-e DEEPSEEK_API_KEY=...` for real-LLM responses.
> Reset to a clean state: `docker rm -f keelbase && docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest`

**Option B — local dev**

```bash
cp Server-NestJS/.env.example Server-NestJS/.env
cd Server-NestJS && npm install && npm run start:dev
```

Accounts: `alex / Alex@2026$Demo` (workbench) · `admin / Admin@2026$KeelBase` (Admin Console) · register a second account `bob` (`POST /auth/register`) for the permission-denied demo.

## 1. Permission denied (row-level authorization)

**Proof**: cross-user data access is rejected by **row-level policy** at runtime (a real boundary, not a prompt suggestion).

- Run: log in as `bob` in the workbench → open `/workbench/crm/1` (alex's customer) → the UI shows "**No access to this customer**"
- Or API: `GET /crm/customers/1` (bob token) → `403 无权访问此客户`
- Systematic coverage: [security-verification-matrix.md](security-verification-matrix.md) — sensitive resources × scenarios, 13 e2e suites (cross-user CRUD / non-admin access / cross-org / AI-tool access)

## 2. Tool governance & risk tiers

**Proof**: AI tools are classified by risk tier (R0–R5) with read/write categories, fully governable.

- Run: Admin Console → **AI Tools** (`/admin/#/ai-tools`) → tool list with risk-tier tags (R1 read auto / R3 write confirmation / R4 two-person approval / R5 block) + permission metadata
- Live: during an AI tool call, the `tool_start` event carries `riskLevel` + **authorization reasons** (why execution was allowed)

## 3. Human approval (confirmation gate + R4 two-person approval)

**Proof**: AI write operations require human confirmation; high-impact actions need a second approver.

- Run: workbench AI chat "为辰光建材创建跟进任务" → **confirmation card** (R3 write: risk tier + technical authorization details + approve/reject/trust-for-session) → approve → persisted → "confirmed · reversible"
- Admin Console → **AI Approvals** (`/admin/#/ai-approvals`) → R4 two-person approval records
- API: `POST /ai/confirmations/:token` (approve / reject)

## 4. Audit hash chain

**Proof**: every AI call / tool execution is audited; the hash chain is verifiable (tamper-proof, correctable).

- Run: Admin Console → **AI Audit** (`/admin/#/audit`) → `GET /audit/verify` → `valid:true`
- Concurrency stress: `cd Server-NestJS && npm run audit:chain:load` (1000-entry baseline: 0 forks + verify green + throughput/P95)
- Revoke: AI-created records can be revoked from the AI trace page (soft-delete, restorable via trash)

## 5. Agent behavior baseline (attack suite + golden loop)

**Proof**: AI agents **block all attacks** (prompt injection / authorization bypass / confirmation bypass / revoke bypass); the golden loop reproduces end-to-end.

- Attack suite: `./scripts/verify-security-eval.sh` → **12/12 blocked** (reject 8/8 + confirmation-bypass / cross-org-read / revoke-bypass)
- Golden loop: `./scripts/verify-golden-application.sh` → **8/8** (customer → risk → follow-up task → confirm → write → audit → revoke)
- LLM behavior baseline: `LLM_ENV=1 ./scripts/release-gate.sh` (Run/Adversarial dimension, agent-benchmark 15 cases Run/Trust/Safety)

## Acceptance checklist (self-service)

- [ ] Cross-user data access → 403 + explicit "no access" UI
- [ ] AI tools risk-tiered (R0–R5), calls carry authorization reasons
- [ ] AI writes require human confirmation; R4 high-impact needs two-person approval
- [ ] Audit hash chain `valid:true`, concurrency stress 0 forks
- [ ] Attack suite 12/12 blocked, golden loop 8/8

## Related

- Authorization matrix: [security-verification-matrix.md](security-verification-matrix.md) · Internal gate: [release-gate.md](release-gate.md)
- Demo script: [golden-demo-script.md](golden-demo-script.md) · 30-min build: [onboarding-30min.md](onboarding-30min.md)
