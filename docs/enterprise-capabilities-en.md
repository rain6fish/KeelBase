# KeelBase — Enterprise Capability Statement

> For enterprise selection reviews: each capability KeelBase provides is declared item by item, with **evidence** (endpoints / docs / tests / tooling) rather than vague marketing.
> Internal gaps live in [enterprise-readiness.md](enterprise-readiness.md) (living checklist); security policy and disclosure live in [SECURITY.md](../SECURITY.md).

**Dual narrative** (§7.4 #4): KeelBase presents two narratives side by side, neither overshadowing the other:
1. **AI capability**: Business-safe Agent — AI doesn't just answer, it does real work inside permission / confirmation / audit boundaries (§9 Agent governance + the flagship apps as proof);
2. **Data sovereignty / Private AI**: a data-stays-in-perimeter private AI loop — local LLM + local Embedding + local audit, all verifiable end-to-end (§10).

---

## 1. Authentication

**Capability**: register/login / JWT access+refresh rotation (SHA-256 hash storage) / multi-device session management / consecutive-failure lockout / anti-enumeration unified responses / random delay anti-timing / email·phone verification / forgot password / OAuth third-party (WeChat·Alipay·Google·Apple) / **TOTP two-factor (MFA)** / forced password change / self-deactivation / data-portability export.

**Evidence**: `/auth/*` (login / refresh / sessions / oauth / mfa / change-password / deactivate / export-data); [session-management.spec.md](session-management.spec.md), [account-compliance](account-compliance.spec.md), [oauth-config.md](oauth-config.md), [web-front.spec.md](web-front.spec.md) (MFA).

## 2. Authorization

**Capability**: roles (user / admin) + route-level policies (`@CheckPolicies`) + service-layer subject checks; admin-only endpoints CASL-gated (normal users get 403).

**Evidence**: global `PoliciesGuard` + `CaslAbilityFactory`; `/users`, `/events/admin/*`, `/admin/*` etc.

## 3. Data-Level Permissions / CASL

**Capability**: row-level authorization (own-data / org-visible / admin full) + verification even after soft-delete (withDeleted) + org-dimension data isolation (ORG-3).

**Evidence**: events / todos carry `org_id` with "own OR same-org" queries; `subject('Event', entity)` + `ability.cannot(...)`; [org5-ai-tools.spec.md](org5-ai-tools.spec.md).

## 4. Audit

**Capability**: operation audit (write ops who/what/when/IP) + AI audit (tool calls / confirmation decisions / side effects) + **HMAC hash chain anti-tampering (HS-11)** + user/org/feedback filters + cost dashboard.

**Evidence**: `/audit/logs`, `/audit/operations/logs`, `/audit/verify`, `/audit/operations/verify`, `/audit/cost`; [hs11-audit-chain.spec.md](hs11-audit-chain.spec.md).

## 5. Encryption

**Capability**: passwords bcrypt(12); refresh tokens SHA-256 hash storage; sensitive fields (phone / providerId / mfa_secret) AES-256-GCM at-rest encryption; providerHash derived via HMAC-SHA256; upload magic-byte validation + signed-URL access control (CR-21).

**Evidence**: `EncryptionService`, `UploadSignService`; [storage-abstraction.spec.md](storage-abstraction.spec.md), [hs10-mcp-adapter.spec.md](hs10-mcp-adapter.spec.md).

## 6. Observability

**Capability**: structured logging (pino) + Prometheus metrics + OpenTelemetry tracing (business spans + TypeORM db.query spans) + Loki centralized logs + Grafana dashboards + Prometheus alerts (ServerDown / error rate / latency / concurrency) + exception-alert webhook (DingTalk/Feishu/Slack) + Admin Console "Monitor"/"Ops" aggregate pages + health check with dependency details.

**Evidence**: `/metrics`, `/health?detail=true`, `/admin/ops/summary`; `docker-compose.observability.yml`; [operations.md](manual/operations.md).

## 7. Backup & Restore

**Capability**: scheduled DB backup + rotation retention (default 7 copies) + restore script + ops health checks including backup freshness.

**Evidence**: `npm run backup` / `npm run restore -- <file>`; `scripts/healthcheck.ts`; [backup-restore.spec.md](backup-restore.spec.md).

## 8. Deployment

**Capability**: one-click Docker Compose (HTTPS optional) + **single-container all-in-one (`docker run` one command)** + offline intranet deployment + K8s manifests + blue-green/canary + Web-Admin independent deployment + read/write separation (TypeORM replication).

**Evidence**: `deploy/deploy.sh`, `deploy/deploy-offline.sh`, `Dockerfile.single`, `infra/k8s/`, `deploy/blue-green.sh`; [one-click-deploy.md](manual/one-click-deploy.md), [offline-deploy.md](manual/offline-deploy.md), [admin-deploy.md](manual/admin-deploy.md), [blue-green-deploy.md](manual/blue-green-deploy.md).

## 9. Agent Governance

**Capability**: tool-level permissions (role/email/feature-flag gates) + human confirmation for writes (configurable TTL / session trust) + side-effect idempotency and revocation + context-injection defenses (sensitive masking / system boundaries / injection detection) + tool-result token budgets + configurable governance policy (enabled/requiresConfirmation/allowedRoles/audit granularity) + MCP import/export under the same governance layer + decision trace (user-side read/write labels) + AI eval loop + behavior replay.

**Evidence**: HS-1~HS-11 ([hs9-governance-policy.spec.md](hs9-governance-policy.spec.md), [hs10-mcp-adapter.spec.md](hs10-mcp-adapter.spec.md), [hs11-audit-chain.spec.md](hs11-audit-chain.spec.md)); `/admin/ai/tools`, `/ai/tool-effects`, `/ai/eval/*`, Web-Admin "AI behavior replay".

## 10. Private AI

**Capability**: local LLM (Ollama/vLLM OpenAI-compatible) auto-registration without keys + local Embedding (bge-m3) + cloud→local degradation chain + vector search (pgvector) + offline image presets — a fully verifiable "data-stays-in-perimeter" loop (chat → audit `provider:ollama` → local embedding → hash chain valid).

**Evidence**: `OLLAMA_BASE_URL` / `AI_PROVIDER=ollama`; [offline-deploy.md](manual/offline-deploy.md) + [private-ai-report.md](manual/private-ai-report.md) (2026-08-19 local Ollama Cloud OFF full-chain 8/8) + `scripts/verify-private-ai.sh` (one-command "data never leaves" verification).

## 11. Testing & Quality

**Capability**: 1300+ backend unit tests / 126+ e2e (real HTTP) + coverage thresholds (global 65/55/60/65 + **security-module tiered gate** statements≥60) + e2e coverage + migration-consistency CI check + CLI generator tests + 290+ Flutter tests / analyze + Web-Admin typecheck/lint/vitest.

**Evidence**: `npm run test:cov`, `scripts/check-security-coverage.mjs`, `.github/workflows/ci.yml`; [30min-acceptance.md](manual/30min-acceptance.md).

## 12. Security Disclosure & SBOM

**Capability**: security policy + private vulnerability disclosure process (72h acknowledgment + optional PGP) + dependency inventory / SBOM generation + npm audit + production security defaults (non-root / key randomization / HSTS / CSP / tightened CORS).

**Evidence**: [SECURITY.md](../SECURITY.md) (SBOM generation: cyclonedx-npm + dart pub deps).

---

## Compliance Path

| Regulation / requirement | KeelBase capability | Evidence |
|---|---|---|
| Data Security Law / Personal Information Protection Law | At-rest encryption of sensitive data, login brute-force protection, minimal collection, data portability (export-data), self-deactivation, audit trails | §5/§1/§4 |
| Data stays in perimeter / privatization | Local LLM/embedding + offline images + external-dependency degradation | §10 |
| Enterprise security review (MLPS reference) | CASL row-level + audit hash chain + MFA + security disclosure | §3/§4/§1/§12 |

## Related Docs

- [enterprise-readiness.md](enterprise-readiness.md) — living internal-gap checklist (status + todos + priority)
- [SECURITY.md](../SECURITY.md) — security policy and vulnerability disclosure
- [operations.md](manual/operations.md) — operations manual (deploy / env vars / backup / observability)
- [tutorial.md](manual/tutorial.md) — from-zero-to-deployment tutorial
