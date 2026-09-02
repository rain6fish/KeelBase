# KeelBase Compliance Mapping

> **Purpose**: Translates KeelBase's existing capabilities into compliance language for government/enterprise procurement, audit cooperation and pre-sales. This is a **factual capability-to-requirement mapping** — free of positioning or competitive statements.
>
> **Disclaimer**: KeelBase is an AI runtime/middleware, not an AI system per se under the AI Act. This table shows how existing KeelBase capabilities **help deployers meet** obligations; it is not legal advice. The authoritative text of any applicable regulation governs.

---

## 0. Capability Inventory

| Domain | Key capabilities |
|---|---|
| Identity & Access | JWT (access+refresh rotation, SHA-256 hashed storage), MFA (TOTP), login lockout, CASL row-level authorization, roles, OIDC, Explainable Authz, cross-system delegation tokens (audience-limited, short-lived) |
| Data Protection | AES-256-GCM encryption at rest (phone/providerId), admin-side field masking (sanitizeForAdmin), audit-log sensitive-field redaction, self-hosted deployment (data never leaves the domain), local models (Ollama) |
| Audit | AI audit hash chain (HMAC-SHA256 + prev_hash, tamper-evident, verifiable), operation audit, field-level change diff (before/after), business-event normalization, Decision Trace, signed audit evidence export (full chain rows, **offline-machine-verifiable** via `verify-evidence.mjs`), cross-system aggregated audit (governance console) |
| Governance | Tool risk levels R0–R5, tool gating, human confirmation (R3), two-person approval (R4), side-effect registration & revocation (incl. cross-system callbacks), live governance policy, Agent Registry, standalone governance console (Guard), zero-code sidecar adoption |
| Security Hardening | Prompt-injection defense, content safety (sensitive-word/jailbreak detection), SSRF protection, upload MIME/magic-byte validation, rate limiting, Helmet headers, allow-list validation, dependency updates |
| Privacy & User Rights | Data portability export (/auth/export-data), account deactivation cascade, AI memory clearing, masked leaderboards |
| Observability | pino structured logs, Prometheus metrics, OpenTelemetry tracing, audit trend/anomaly views |

---

## 1. China National Standards: 《Artificial Intelligence — Agent Interconnection》series (released 2026-06)

Released by SAMR in June 2026 as **7 national standards** covering: overall architecture, identity codes, identity management, agent description, agent discovery, agent interaction, agent tool invocation — forming the closed loop "identity marking → capability description → discovery → collaborative interaction → tool invocation". Specific GB/T numbers to be confirmed against the official published text.

| Standard direction | KeelBase capability | Status | Note |
|---|---|---|---|
| Overall architecture | Three-layer model (Agent Framework → KeelBase Trust layer → business systems) + five-layer Trust model (L1 Identity → L5 Side-effect) | ✅ | The runtime is the trust layer for agent interconnection by construction |
| Identity codes / management | Agent Identity (agent_id/session_id in audit), Agent Registry, OIDC identity sources, cross-system delegation tokens (aud/iss/oidcSub semantics), SHA-256 hashed storage | ✅ | Agent identity marking & cross-system identity mapping present |
| Agent description | Agent Registry capability JSON, tool JSON-Schema declarations, R0–R5 risk declarations, §4.4 MCP declaration extension (`_meta.keelbase`) | ✅ | Machine-readable agent/tool capability descriptions |
| Agent discovery | MCP export (tools/list), capability list (/app/capabilities), tool listings | ✅ | Standard discovery protocol (MCP) |
| Agent interaction | MCP gateway, SSE streaming, WebSocket channel, conversation history | ✅ | Multi-channel interaction |
| **Agent tool invocation** | **Full tool-governance pipeline: R0–R5 risk → gating → human confirmation / two-person approval → side-effect registration & revocation → audit hash chain + decision trace** | ✅ | **KeelBase's core alignment**: the governed runtime for the "tool invocation" link |
| Collaboration (security) | Zero-code sidecar adoption, cross-system audit aggregation, cross-system revoke callbacks | ✅ | Governance consistency across systems |

> **Takeaway**: KeelBase's differentiation concentrates on the **tool invocation** and **identity** links of the standard loop — governed, auditable, revocable.

---

## 2. EU AI Act (EU 2024/1689) mapping

**Position**: helps deployers of high-risk AI systems meet obligations (KeelBase provides the implementation vehicle for logging, oversight and governance). Article numbers to be confirmed against the official text.

| Obligation | KeelBase capability | Status | Note |
|---|---|---|---|
| Risk management (Art. 9) | R0–R5 tool risk levels + gating + block (R5) | ✅ | Tool-level risk model = risk-mitigation vehicle |
| Data governance (Art. 10) | Field masking, encryption at rest, data-sovereign deployment | ✅ | Data governance & minimization |
| Technical documentation (Art. 11) | Bilingual docs, /app/provenance fingerprint, capability list | ✅ | Traceable system provenance |
| **Record-keeping / logging (Art. 12)** | **Audit hash chain (tamper-evident) + decision trace + field-level diff + business events + signed evidence export (offline-machine-verifiable)** | ✅ | **Primary alignment**: full, verifiable, exportable AI decision logging |
| Transparency to deployers (Art. 13) | Explainable Authz (why allowed/denied), decision trace, layered "why" in audit | ✅ | Explainable decisions |
| **Human oversight (Art. 14)** | **Human confirmation (R3), two-person approval (R4), revocation, manually configured policies** | ✅ | **Secondary alignment**: human-in-the-loop is core design |
| Accuracy/robustness/cybersecurity (Art. 15) | AI Eval suite, safety evals, injection defense, SSRF/upload protection, rate limiting | 🔶 | Tool-level evals; model-level robustness depends on the chosen LLM |
| Specific transparency (Art. 50) | AI audit provider attribution | 🔶 | Partial; AI-generated disclosure controlled by deployer UI |

---

## 3. MLPS 2.0 (GB/T 22239-2019) mapping

| Secure computing environment requirement | KeelBase capability | Status | Note |
|---|---|---|---|
| Identity authentication | JWT + password strength + lockout + MFA (TOTP) + session management | ✅ | 2FA + brute-force protection |
| Access control | CASL row-level authorization + roles + ownership checks + frontend permission points | ✅ | Least privilege + row-level isolation |
| **Security audit** | **AI/operation audit hash chain + field-level change + trend/anomaly views + evidence export (offline-verifiable)** | ✅ | Tamper-evident, independently verifiable audit records |
| Data integrity | Audit hash chain (HMAC verification), upload magic-byte validation | ✅ | Record & file integrity |
| Data confidentiality | AES-256-GCM encryption at rest, masking, sensitive-field redaction | ✅ | At-rest encryption + display masking |
| Personal information protection | Admin-side masking, data portability export, deactivation cleanup, privacy policy | ✅ | Minimization + rights response |
| Trusted verification (optional) | Offline deployment, no-external-link operation (data stays in-domain) | 🔶 | Depends on MLPS level decision |

---

## 4. Data compliance mapping (PIPL / Data Security Law)

| Requirement | KeelBase capability | Status | Note |
|---|---|---|---|
| Cross-border transfer compliance | Self-hosted + local models, data never leaves the domain | ✅ | Eliminates cross-border scenarios |
| Data minimization | Tool data scopes (self/org), field-level scope, masking | ✅ | Access bounded by business scope |
| Personal info masking | sanitizeForAdmin (email/phone masked; bio/birthday not returned) | ✅ | Admin side never exposes plaintext |
| Deletion / portability rights | Account deactivation cascade, /auth/export-data, AI memory clearing | ✅ | Complete rights-response paths |
| Auditable processing records | Full-chain audit + hash chain | ✅ | Traceable processing |

---

## 5. Content-safety regulation for generative AI (CN)

**Position**: CN regulators require generative-AI service providers to strictly fulfil content-safety duties and restrict non-compliant outputs (framework: 《Interim Measures for the Management of Generative Artificial Intelligence Services》, effective 2023; specific requirements evolve with regulator policy — the official text governs). KeelBase is a runtime/middleware — **it does not replace model-layer content moderation**. This section states the responsibility split and how KeelBase helps deployers evidence that "AI output was vetted".

### Responsibility split

| Layer | Content-safety responsibility |
|---|---|
| Model layer (service provider) | Model content moderation, blocking non-compliant outputs — deployers should choose model services that pass content-safety review |
| Content-moderation service (optional, deployer-managed) | Real-time moderation of sensitive words / jailbreaks / non-compliant content (third-party moderation API or on-prem) |
| **KeelBase** | **Action governance + audit trail: produces no content and does not replace content moderation, but folds moderation events into the unified audit chain for evidentiary tracing** |

### How KeelBase helps

| Regulatory concern | Existing KeelBase capability | Note |
|---|---|---|
| Prove "output was vetted" | AI audit hash chain + Decision Trace | Deployers can record "moderation call / hit / block" as audit events on the tamper-evident, offline-verifiable chain — self-evidence that output is vetted and traceable |
| Lightweight first-line content check | Sensitive-word / jailbreak detection (see §0 Security Hardening) | Input-side lightweight defense; **not a substitute** for a professional moderation service |
| Backstop for high-risk output | Human confirmation (R3) / two-person approval (R4) | Key business actions are human-gated, narrowing the automated-output risk surface |
| Clear responsibility boundary | Self-hosted deployment; models/policies controlled by the deployer | Whoever supplies the model owns content responsibility; KeelBase makes "enterprise control + auditable" real |

> **Boundary note**: content-compliance obligations sit at the model layer; KeelBase is not a content-moderation engine. Its value is turning "was it vetted, against what, and what was the result" into a tamper-evident evidence chain — helping deployers evidence compliance rather than substituting for it.

---

## 6. National crypto (GM/T 0054) & Xinchuang gaps

> **Honest disclosure**: these are real current gaps, not claimed as met. Gaps are the planning input for the "Xinchuang adaptation certification" service card.

| Gap | Impact | Plan |
|---|---|---|
| **National crypto (SM2/SM3/SM4) not supported** | Audit hash chain uses HMAC-SHA256, encryption AES-256-GCM (non-GM); GM/T 0054 requires approved commercial crypto | Evaluate dual-algorithm support (SM3 hash chain — dual-write or configurable digest); requires a real MLPS-crypto project to drive |
| **Domestic databases (DaMeng/KingbaseES) not adapted** | Currently sqlite/postgres only; limited domestic DB choices | postgres compatibility line is the starting point (Kingbase is postgres-derived, low cost); DaMeng needs dedicated work |
| Domestic CPU/OS (Kylin/UOS/arm64/LoongArch) | Node official arm64 builds available; LoongArch etc. need verification | Inventory only verified items (service card ①) |
| SAML / LDAP directory sync | OIDC only; some government buyers use SAML | Demand-driven (enterprise selection item) |
| High availability / multi-replica | Single-replica design (confirmation/session trust in-process) | Enterprise "HA" list, driven by paying customer |
| Data retention policy (compliance retention/auto-purge) | Not configurable | Enterprise "data retention" candidate |

---

## 7. Conclusion

> KeelBase aligns strongly with the Agent-Interconnection national standards, the EU AI Act logging/human-oversight obligations, and MLPS security-audit requirements on four dimensions: **governed tool invocation, audit hash chain, human-in-the-loop, and data-sovereign deployment**. Main gaps: **national crypto (SM2/3/4), domestic databases, SAML/LDAP** — the inputs for the Xinchuang adaptation certification service. Authoritative legal texts govern.
