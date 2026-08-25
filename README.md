# KeelBase — Build and Run Business-safe AI Applications

> **Open-source Enterprise AI Trust Runtime** — connect AI agents with existing business systems, adding identity, governance, auditability, and private deployment **without replacing existing technology stacks**. Build and run business-safe AI applications from new business models or existing systems.

<p align="center">
  <img src="docs/branding/keelbase-architecture.svg" alt="KeelBase — Enterprise AI Trust Runtime between AI Agents and Business Systems" width="840">
</p>

> **Build AI applications that can safely act on business data.**

---

## 🚀 Try in 60 Seconds

Docker only — one command brings up the entire application (backend + workbench + Admin Console + mobile preview), no build:

```bash
docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
```

Then walk the golden path in 6 steps:

```text
1. Open http://localhost:3000            (workbench) — /admin is the Admin Console
2. Sign in — alex/123456, or admin/Admin@1234
3. Ask: "Which customers are at the highest risk this week?"
4. Watch AI analyze real business data
5. Approve a follow-up task              (human confirmation)
6. Open the audit trace                  (every action recorded & reversible)
```

Prefers a read-only live demo? `./deploy/demo.sh` → http://localhost:8080.

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

Full flow: [30-minute acceptance](docs/manual/30min-acceptance.md) · [Dev Challenge](docs/manual/dev-challenge.md)

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

The core is UI-framework-agnostic; Flutter / Vue / React are Renderers ([architecture-boundary](docs/architecture-boundary.md)).

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

- [Quick Start (5-min, no code)](docs/manual/quickstart-en.md) · [FAQ](docs/manual/faq-en.md) · [Tutorial](docs/manual/tutorial.md)
- [Operations](docs/manual/operations.md) · [Development](docs/manual/development.md) · [Private AI verification](docs/manual/private-ai-verification.md)
- [Flagship apps spec (AI CRM / PM / Approval)](docs/flagship-applications.md) · [Enterprise capabilities](docs/enterprise-capabilities.md)
- [CLAUDE.md](CLAUDE.md) (architecture & conventions) · [AGENTS.md](AGENTS.md) (AI build rules) · [SECURITY.md](SECURITY.md)
- **Explore all capabilities →** [docs/](docs/)

---

## 🤝 Community & Contributing

- [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · **MIT** licensed
- Demo accounts: `alex/123456` (workbench / mobile) · `admin/Admin@1234` (Admin Console)

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

Flutter 3.x · Vue3 + Element Plus · React 19 (preview) · NestJS 11 + TypeORM · SQLite / PostgreSQL · Redis + BullMQ · JWT + CASL · OpenAI-compatible LLMs (DeepSeek / Qwen / OpenAI) · pino + Prometheus + OpenTelemetry · Docker / Nginx · CI (GitHub Actions)
