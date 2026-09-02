# KeelBase Product Language Glossary (v0.1)

> **Purpose**: Unify core terms across README / docs / CLI / Admin Console / Workbench, so the "understand in 60s, run in 10min, create in 30min" promise holds — a user sees the same thing called the same word at every entry point.
> **Usage**: Public docs & UI always use the "external standard term"; code and internal docs may use the "internal implementation term"; the table maps them.
> **v0.1**: Core concepts frozen and key divergences resolved; back-fix of UI/docs tracked in §4.

---

## 1. Positioning & One-liner

| Context | Standard phrasing |
|---|---|
| Public one-liner (README / site / video) | **Open-source Business-safe AI Runtime** — lets AI agents act on real business systems safely, under permission, confirmation, audit and revocation, deployable privately |
| Extended name (logo alt / first mention in EN docs) | Enterprise AI Trust Runtime (as a synonym emphasizing the trust layer) |
| Chinese plain sentence | 让 AI 不只是会回答，而是能够安全地做事 (let AI not just answer — but act safely) |

> **Divergence handled**: README used both "Build and Run Business-safe AI Applications" and "Open-source Enterprise AI Trust Runtime" — unify on **Business-safe AI Runtime** as the primary name; Trust Runtime is only the trust-layer emphasis substitute; no longer mixed.

---

## 2. Core Concept Glossary

| External standard (EN) | 中文 | Internal implementation | Definition & use |
|---|---|---|---|
| **Business-safe AI Runtime** | 业务安全 AI 运行时 | `Server-NestJS` | The product: trust layer between AI agents and business systems |
| **Application Protocol** | 应用协议 | `module-protocol` | Semantic source describing a business module (AI-readable; AI generates plain source) |
| **Governance** | 治理 | `governance` | Policy control applied before an AI acts |
| **Governance Console** | 治理控制台 | `governance-sidecar` / Guard | Standalone console governing AI across many systems (external narrative) |
| **Policy** | 策略 | `governance-policy` | Tool enable / confirmation / role allowlist, applied live |
| **Tool** | 工具 | `ai/tools` / ToolRegistry | A business operation the AI can invoke |
| **Risk level** | 风险分级 | R0-R5 | Execution strategy per tool (read auto / write confirm / block) |
| **Confirmation** | 确认 | `confirmation` | Write operations require human confirmation (R3) |
| **Approval** | 审批 | R4 `human_approval` | High-impact actions require two-person approval |
| **Revoke** | 撤销 | `tool-effects` revoke | AI-created side effects can be revoked |
| **Audit** | 审计 | `audit` / `ai_audit_logs` | Record of AI actions |
| **Audit Hash Chain** | 审计哈希链 | `audit-chain` | Tamper-evident chain; altering any record breaks it |
| **Decision Trace** | 决策轨迹 | `decision-trace` | Full chain of one AI action: request→intent→tool→permission→approval→execution→audit |
| **AI Action Log** | AI 行为记录 | `ai-timeline` / audit logs | History list of AI actions (who / when / what) |
| **Business Action** | 业务动作 | `businessAction` | An action the AI completed in a business system (e.g. created a follow-up task) |
| **Business Action Detail** | 业务动作详情 | `workbenchActionDetail` | Full governance view of one business action (Who/What/Why/Result/side effects/integrity) |
| **AI Assistant** | AI 助手 | `aiAssistant` / Copilot | The user↔AI chat entry (generic term) |
| **System AI Assistant** | 系统 AI 助手 | `navSystemAssistant` / admin-ai | Console-level platform assistant (capabilities / governance / navigation) |
| **Side Effect** | 副作用 | `tool-effects` | A revocable business change produced by an AI write |
| **Evidence Package** | 审计证据包 | `ActionReportExport` | Compliance evidence for auditors (hash chain + signature + offline verifiable) |
| **Authorization** | 授权 | CASL / `authorization` | Who may do what on what (incl. data scope) |
| **Data Scope** | 数据范围 | CASL conditions | Self / org / department data boundary |
| **Zero-code Adoption** | 零代码接入 | sidecar | Point your LLM base URL at sidecar → your AI calls are governed |

---

## 3. Key Divergences & Decisions

| # | Divergence | Decision |
|---|---|---|
| 1 | **AI Assistant vs Copilot** | Public name is **AI Assistant**; "System AI Assistant" is specifically the console-level assistant; **Copilot is deprecated** (business-page copy changed to "AI Assistant"; internal identifiers like `CrmCopilotDrawer`/`CopilotItem` retained — not user-visible) |
| 2 | **Decision Trace vs AI Action Log** | Distinguish: **Decision Trace = full chain of ONE action** (drill into an entry); **AI Action Log = history list** (list view). The console list entry keeps its label but content emphasizes "records + open the decision trace" |
| 3 | **Governance Console vs Guard** | Public term is the **Governance** domain: nav uses 治理 → 治理总览 (Governance Overview); the standalone deployable is **Governance Console**; **Guard stays internal-only** (code/docs) |
| 4 | **Positioning sentence** | Primary name is **Business-safe AI Runtime**; Trust Runtime only as trust-layer emphasis; never mixed side by side |
| 5 | **Governance vs Audit** | Clear boundary: **Governance = control before** (policy / confirmation / approval); **Audit = record after** (log / hash chain / evidence). Avoid the fused "governance audit" in public copy |

---

## 4. Todos

- [x] Back-fix UI copy per §3 (2026-09-01): business-page Copilot → AI Assistant (copilotTitle="AI 助手" / action button="AI 分析"); Guard → Governance in user-visible text (navGuard=安全治理 / navGuardOverview=治理总览→Governance Overview)
- [ ] Audit README & quick-start docs against §2 terminology
- [ ] Freeze v0.1, register bilingual pair in README

---

*v0.1 draft · 2026-09-01 · Unified product language (P0-4)*
