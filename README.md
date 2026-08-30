# KeelBase — Build and Run Business-safe AI Applications

> **Build AI applications that enterprises can trust — from scratch or from existing systems.** Governed, auditable and private by default.

<p align="center">
  <img src="docs/branding/keelbase-architecture.svg" alt="KeelBase — Enterprise AI Trust Runtime between AI Agents and Business Systems" width="840">
</p>

> **Open-source Enterprise AI Trust Runtime** — connect AI agents with existing business systems, **without replacing existing technology stacks**.

---

## 🚀 Try in 60 Seconds

> Prefer instant? **Open the live demo** → [keelbase-demo](http://121.199.30.80/user/) (`alex/Alex@2026$Demo` — workbench, ask "which customers need attention?"). Visit guide: [demo-live.md](docs/manual/demo-live.md).
>
> Or **watch the demo video** → [English demo (GitHub Pages)](https://rain6fish.github.io/KeelBase/video-en.html) · [China mirror](http://121.199.30.80/demo/video-en.html) (4-min, with real system demos; download: [GitHub release](https://github.com/rain6fish/KeelBase/releases/tag/demo-videos)).

Docker only — one command brings up the entire application (backend + workbench + Admin Console + mobile preview), no build:

```bash
docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
```

> No LLM API key needed to try it: when no cloud/local model is configured, the AI runs in **deterministic demo mode** — the full golden path (analyze → confirm → create → audit → revoke) works out of the box. Bring your own DeepSeek/Qwen/OpenAI/Ollama key (`-e DEEPSEEK_API_KEY=...`) for real LLM responses.
>
> **Reset to a clean demo state anytime**: `docker rm -f keelbase && docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest` — data lives in the container's SQLite (no volume), so removing the container wipes demo data and the seed re-runs on next start.

Then walk the golden path in 6 steps:

```text
1. Open http://localhost:3000            (workbench) — /admin is the Admin Console
2. Sign in — alex/Alex@2026$Demo, or admin/Admin@2026$KeelBase (consistent across all environments)
3. Ask: "Which customers are at the highest risk this week?"
4. Watch AI analyze real business data
5. Approve a follow-up task              (human confirmation)
6. Open the audit trace                  (every action recorded & reversible)
```

Prefers a local demo? `./deploy/demo.sh` → http://localhost:3000 (opens the AI CRM Golden Flow workbench).

---

## 🎯 See AI Actually Do Business

KeelBase's flagship **AI CRM** is not a demo — it's a working product loop:

```text
You:
"Which customers are at the highest risk this week?"

KeelBase AI:
3 customers require attention…
  → Analyze customer risk
  → Read authorized orders and activities
  → Create a follow-up task
  → Ask for your confirmation
  → Write to the CRM
  → Record audit
  → Allow revoke
```

One business scenario says more than a list of twenty features.

---

## 🎯 Who It's For

Two ways to meet KeelBase — one runtime underneath.

**For AI-native builders** — ship an AI business application without rebuilding the foundation:
- Generate a full business module (entities / CRUD / permissions / AI tools / audit) from a protocol in ~30 minutes — real, editable code, not a low-code engine
- Bring your own LLM (cloud or local); data stays under your control

**For teams with existing business systems** — you already run CRM / ERP / OA or a decade-old Java stack, and you want it to think:
- Bridge existing systems in (OpenAPI / SQL schema / Java service) without rewriting them
- AI acts as a business assistant on your real data — risk analysis, follow-ups, summaries, approvals
- Private deployment: Docker / offline / local models — data never leaves your perimeter

> **Standalone or connected** — KeelBase is a complete application development platform in its own right (generate full-stack business apps from a protocol), and an AI Trust Runtime for existing systems. No legacy system required.

---

## 🔐 Business-safe by Design

```text
User Request → AI Understanding → Business Data → Tool Call
        → Permission Check → Human Confirmation
        → Side Effect → Audit → Revoke
```

> **AI can act — but only within explicit business boundaries.**

- **User-scoped tools** — every call carries the authenticated user; AI can only touch that user's data
- **Human confirmation** — write operations require explicit approval before execution
- **Audit & revoke** — every action lands on a tamper-evident audit hash chain; AI-created side effects are tracked and reversible
- **Explainable** — "why did the AI do that?" is answered by a decision trace, not a black box

---

## 🏗 Build — AI Application Engineering

Build AI applications from new business models or existing systems:

- **Application Protocol** — a human/AI-readable schema describing an application
- **`keelbase init`** — natural language / SQL schema / OpenAPI → Protocol → a complete business module with permissions, AI tools, confirmation, and audit
- **AI Bridge** — connect a Java/legacy system; AI reads and acts on it under governance

> Generated artifacts are **normal source code**. No proprietary runtime metadata. No drag-and-drop lock-in.

---

## ▶️ Run — AI Does Real Business Work

- Tool calling, RAG, memory, sub-agents, proactive AI
- AI reads and acts on **business data** — not just chat
- Every tool call scoped, every write confirmed, every action audited

---

## 🔒 Trust — Governance & Audit

Where KeelBase differs from a plain agent framework:

- CASL row-level permissions · tool governance · write confirmation
- Audit hash chain (tamper-evident) · side-effect idempotency · revoke
- Decision trace · AI eval · prompt-injection defense

### Enterprise Safety Validation

These aren't just claims — every one is verified by an executable test that ships with the repo:

- ✓ **Permission boundary tests** — cross-user access denied via CASL (39-case authorization matrix)
- ✓ **Tool governance tests** — abuse / confirmation-bypass / prompt-injection blocked (12/12 security eval)
- ✓ **Human approval tests** — writes stay untouched until a human confirms (Golden Flow e2e)
- ✓ **Audit integrity tests** — audit hash chain verifies, tampering fails (`/audit/verify`)
- ✓ **Agent behavior tests** — decision trace + business-safe agent benchmark (15/15 Run/Trust/Safety)
- ✓ **End-to-end business flow** — AI CRM: read → risk → task → confirm → write → audit → revoke (deterministic e2e)

---

## 🏠 Deploy — Private by Design

```text
Cloud LLM  OR  Local Model / Ollama
        → Local Embedding → Local RAG → Business-safe Agent → Local Audit
```

> **Run the entire AI application locally when your data cannot leave your environment.**

Docker single-container · offline / intranet deploy · local models & embeddings.

---

## 🛠 Build Your First Application

```bash
npm install -g keelbase
keelbase init --desc "Customer management"
```

Natural Language → Module Spec → Protocol → Application Code → AI Tools → Governance.

Full flow: [Build an AI CRM in 30 minutes](docs/manual/onboarding-30min.md) · [30-minute acceptance](docs/manual/30min-acceptance.md) · [Dev Challenge](docs/manual/dev-challenge.md) — 中文 · [EN](docs/manual/onboarding-30min-en.md) · [EN](docs/manual/30min-acceptance-en.md) · [EN](docs/manual/dev-challenge-en.md)

---

## 📦 Existing System AIization

```text
Existing DB / OpenAPI / Java System
        → Application Protocol → Generated Module
        → AI Tools + Governance → Business Agent
```

Give a 10-year-old business system AI capability without rewriting it.

---

## 🧩 Architecture

One main thread — **Build → Run → Trust → Private Deploy**:

- **Build** — *AI Application Engineering:* Application Protocol (conventions); AI generates the business modules — no low-code engine
- **Run** — *Business-safe Agent Runtime:* user-scoped tools, human-confirmed writes, full audit and revoke
- **Trust / Private Deploy** — *Data Sovereignty:* data stays on-prem; AI stays accountable and reversible

The core is UI-framework-agnostic; Flutter / Vue / React are Renderers ([architecture-boundary](docs/architecture-boundary.md) · [EN](docs/architecture-boundary-en.md)).

## 📍 Where KeelBase Sits

> **KeelBase is an Enterprise AI Trust Runtime** — it connects AI agents with existing business systems, adding identity, governance, auditability, and private deployment, **without replacing existing technology stacks**.

```text
      AI Applications / Agents
      Agent Frameworks
  LangGraph · AutoGen · CrewAI
  Custom Agents · MCP Clients
                    ▲
                    │ identity · policy · governance
                    │ audit · runtime · deployment
              ┌─────────────┐
              │  KeelBase   │
              │ Enterprise  │
              │ AI Trust    │
              │ Runtime     │
              └─────────────┘
                    │
                    │ bridge · protocol · capability mapping
                    ▼
      Existing Business Systems
      CRM · ERP · OA · MES · Database
```

- **Up — the AI world (northbound):** any agent can enter governance. Agent frameworks connect via **open standards (MCP / OpenAPI / function calling)** — KeelBase does not re-build orchestration, agent loops, or memory strategies
- **Down — the business world (southbound):** any existing system can become AI-capable. Business systems connect via the **Bridge** (protocol + capability mapping) — no rip-and-replace
- **In between — the trust layer:** identity, policy, permission, human confirmation, side-effect control, audit & revoke, private deployment

---

## 📚 Documentation

> Every guide ships in **中文 and English** — pick your language below.

- **Quick Start 快速开始** — [中文](docs/manual/quickstart.md) · [English](docs/manual/quickstart-en.md)
- **Tutorial 零基础教程** — [中文](docs/manual/tutorial.md) · [English](docs/manual/tutorial-en.md)
- **Build an AI CRM in 30 minutes 30 分钟构建 AI CRM** — [中文](docs/manual/onboarding-30min.md) · [English](docs/manual/onboarding-30min-en.md)
- **30-Minute Acceptance 30 分钟验收** — [中文](docs/manual/30min-acceptance.md) · [English](docs/manual/30min-acceptance-en.md)
- **Dev Challenge 开发者 30 分钟挑战** — [中文](docs/manual/dev-challenge.md) · [English](docs/manual/dev-challenge-en.md)
- **FAQ 常见问题** — [中文](docs/manual/faq.md) · [English](docs/manual/faq-en.md)
- **Operations 运维手册** — [中文](docs/manual/operations-zh.md) · [English](docs/manual/operations.md)
- **Development 开发手册** — [中文](docs/manual/development-zh.md) · [English](docs/manual/development.md)
- **Private AI Verification 私有 AI 验证** — [中文](docs/manual/private-ai-verification.md) · [English](docs/manual/private-ai-verification-en.md)
- **Flagship Apps Spec 旗舰应用规格** — [中文](docs/flagship-applications.md) · [English](docs/flagship-applications-en.md)
- **Enterprise Capabilities 企业能力声明** — [中文](docs/enterprise-capabilities.md) · [English](docs/enterprise-capabilities-en.md)
- **Architecture Boundary 架构边界** — [中文](docs/architecture-boundary.md) · [English](docs/architecture-boundary-en.md)
- **Authorization Architecture 权限架构** — [中文](docs/authorization-architecture.md) · [English](docs/authorization-architecture-en.md)
- **External system integration 外部系统集成**
  - **AI Bridge 存量系统 AI 化** — [中文](docs/manual/ai-bridge.md) · [English](docs/manual/ai-bridge-en.md)
  - **Capability Declaration 轻量能力声明** — [中文](docs/manual/capability-declaration.md) · [English](docs/manual/capability-declaration-en.md)
  - **External CRM Demo 外部 CRM 接入演示** — [中文](docs/manual/external-crm-demo.md) · [English](docs/manual/external-crm-demo-en.md)
  - **Framework Adapter Agent 框架接入** — [中文](docs/manual/framework-adapter.md) · [English](docs/manual/framework-adapter-en.md)
  - **Java Starter (Spring Boot)** — turn Java/Spring methods into governed KeelBase AI tools with `@KeelbaseTool`: delegated identity, read/write confirmation, audit and revocation are all handled by the KeelBase runtime. → [GitHub: rain6fish/KeelBase-java-starter](https://github.com/rain6fish/KeelBase-java-starter)
- [CLAUDE.md](CLAUDE.md) (architecture & conventions) · [AGENTS.md](AGENTS.md) (AI build rules) · [SECURITY.md](SECURITY.md)
- **Explore all capabilities →** [docs/](docs/)

---

## 🤝 Community & Contributing

- [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · **Apache-2.0** licensed
- **Issues & feature requests** → [github.com/rain6fish/KeelBase/issues](https://github.com/rain6fish/KeelBase/issues)
- Demo accounts: `alex/Alex@2026$Demo` (workbench / mobile) · `admin/Admin@2026$KeelBase` (Admin Console) — consistent across all environments

## Repositories

| Directory | Description |
|-----------|-------------|
| `Server-NestJS/` | NestJS backend (REST API) |
| `Front-Flutter/` | Flutter main app (iOS / Android / Web) |
| `Front-Taro/` | Taro H5 / mini-program app |
| `Web-Admin-Vue/` | Web host — workbench + admin console, one shell (Vue3 + Element Plus) |
| `Web-Admin-React/` | Admin console React preview (React 19 + MUI) |
| `docs/` | Specs, requirements, manuals |

## Tech Stack

Flutter 3.x · Vue3 + Element Plus · React 19 (preview) · NestJS 11 + TypeORM · SQLite / PostgreSQL · Redis + BullMQ · JWT + CASL · OpenAI-compatible LLMs (DeepSeek / Qwen / OpenAI / Claude / Gemini) · pino + Prometheus + OpenTelemetry · Docker / Nginx · CI (GitHub Actions)
