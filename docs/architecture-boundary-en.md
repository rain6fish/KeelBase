# KeelBase Architecture Boundary

> Established 2026-08-18 (based on _KeelBase Follow-up Development Recommendations_ §8-9, §23). This document defines the **boundary between Core and UI frameworks**, the **Renderer contract**, and the **frontend strategy** — turning "Core is UI-agnostic" from "accidentally correct" into "written down and enforced" (CI gate: `scripts/check-core-boundary.mjs`).

---

## 1. Layered Overview

```text
                         KeelBase
                            │
                 Application Protocol        ← semantic core (Application/Runtime/Trust Model)
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
        Build              Run              Trust
          │                 │                 │
    Development AI     Agent Runtime      Governance
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                    Business Applications
                            │
              ┌─────────────┼─────────────┐
              │             │             │
             CRM          Project       Approval
                            │
                     Private Deployment
                            │
                     Plugin / Skill / Template
                            │
                     External Ecosystem
```

## 2. Core Boundary

**Core = the Server-NestJS backend** (entities / CASL / AI runtime / governance / audit / Protocol / the contracts the generator consumes).

### Core MUST NOT depend on

```text
Vue
React
Vuetify
Element Plus
MUI
Ant Design
Flutter
Taro
```

That is: Core's `package.json` must not import any UI framework; Core modules must not `import` frontend directory code. (CI gate: `npm run check:boundary`.)

### Core MAY define

```text
Application Model      Entity / Field / Relation / API / Page / Navigation
Runtime Model          Tool / Skill / Agent / Context / Workflow
Trust Model            Permission / Policy / Confirmation / Audit / SideEffect / Approval
API Contract           REST/SSE/WS contract (unified response wrapper / camelCase / ISO8601)
Tool Contract          name / args / readOnly / requiresConfirmation / requireVerifiedEmail / featureFlag
Permission Model       CASL capability rules
Audit Model            ai_audit_logs + operation_audit_logs + HS-11 hash chain
```

## 3. Renderer Contract: UI frameworks are Renderers, not the Application Model

All UI frameworks sit below Core, as implementation layers. A new renderer integrates (**without changing Core**) by:

1. **Consuming the capability declaration**: `GET /app/capabilities` (MOD-4) → the backend declares business modules/capabilities/descriptions; the renderer renders navigation and feature entries from it
2. **Consuming the API**: REST (unified response wrapper) / SSE (`/ai/chat/stream`) / WS (`/ws`)
3. **Generator adaptation**: `keelbase init` per-framework templates (`scripts/generator/templates-{backend,frontend,admin,taro}.mjs`) — a new renderer = a new template file, Core untouched

**Semantic route contract**: `src/ai/tools/navigate-page.tool.ts`'s `PAGE_ROUTES` is a **cross-client semantic-route-key → route** mapping (e.g. `events: '/events'`); Flutter and Vue each consume the same key and render to their own routing implementation. **A route is a cross-client contract, not a framework-specific path** — changes must be synced across all clients.

**Experience / UI Contract (clarified 2026-08-19, i.e. the Experience Model boundary alongside the three models)**: Core defines the **data shapes + state machines** of AI interaction experiences; Renderers freely implement the visuals — only data is contracted, no UI component spec (avoiding a slide toward a UI DSL):
- **confirmation**: SSE `confirmation_request` / `confirmation_decision` event payloads (token / tool / args summary) + state machine (`pending → approve | decline | timeout`). The Trust Model decides **whether** confirmation is needed (`requiresConfirmation` / governance policy); the Renderer decides **how** to present the confirmation UI.
- **decision trace**: the step data returned by `GET /ai/conversations/:id/trace` (input / tool_call / confirmation / effect / assistant). Core defines the step shapes; the Renderer decides how to draw the timeline / tool cards.
- **notifications / approval UI**: likewise — Core provides the events and data, the Renderer gives them form.
- A new Renderer only needs to consume these event contracts + `GET /app/capabilities` + REST/SSE/WS; **no cross-client UI component spec is added**.

## 4. Renderer Matrix (frontend strategy, 2026-08-18 / 2026-08-19 upgrade)

UI frameworks are Core's **Renderers** (see §3) — **a new framework = a new Renderer, Core unaffected**. Core competence is not bound to any UI technology. Current renderer matrix:

| Renderer | Framework | Positioning | Status semantics |
|---|---|---|---|
| **Web-Admin-Vue** | Vue 3 + **Element Plus** (migrated from Vuetify, completed 2026-08) | Enterprise web workbench + admin console in one shell | **Official** (official web renderer, primary version) |
| **Web-Admin-React** | React 19 + MUI | Alternative frontend (React approach preview) | **Experimental** (preview 0.1.0; formalization depends on real user demand, not presumed) |
| **Front-Flutter** | Flutter | Mobile main app (iOS/Android); web preview form | **Official Mobile** (mobile primary renderer) |
| **Front-Taro** | Taro Vue3 | H5 / mini-program | **Channel** (channel renderer) |

> Principle: **Renderer / Protocol is the main line, not any single UI framework**. No long-term multi-frontend sync just to "complete the stack" (capability drift); a new renderer = new generator per-framework template + consuming the same Core contract, not on the Core roadmap. Element Plus is the official renderer of the mainstream enterprise-app UI library.

## 5. Defense-in-Depth: the Injection Guard is an aid, governance is the final line of defense

AI security uses **defense in depth** — regex/detection guards are only an auxiliary layer that "reduces inducement"; they are **never the final line of defense** (clarified 2026-08-20):

```text
Injection Guard (regex detection, HS-8, context-injection defense)   ← bypassable, that's fine
    ↓ bypassed
Permission (CASL row-level + HS-9 governance policy)                  ← final defense ①: cross-user rejection
    ↓
Confirmation (requiresConfirmation + confirmation flow)               ← final defense ②: human confirmation for writes
    ↓
Audit (HS-11 hash chain, unconditional recording)                     ← final defense ③: fully auditable & revocable
```

**Principles**:
- `detectInjection` (`src/ai/security/injection-guard.ts`) only handles context-content injection in "memory/RAG/summary" (sensitive-field masking + system-boundary labeling + basic regex detection); it **does not gate tool execution permissions**.
- Tool execution (AI chat `runToolLoop` and the MCP export `executeToolForExternal` share the same chain) unconditionally passes through: `_assertToolAllowed` (HS-9 tool switch + role whitelist) → `_requiresConfirmation` (write confirmation gate) → `auditService.log` (`chat`/`tool_call`/`tool_confirmation`, HS-11).
- **Even if the Injection Guard is bypassed** (regex misses a malicious instruction, the LLM is induced to call a tool): writes still require human confirmation, cross-user access is still rejected by CASL, and everything is still audited; if confirmation is tricked by social engineering, CASL's `userId` data scope still limits operations to the user's own data.
- Any new detection/guard (regex / classifier / prompt hardening) is only the first layer and **must not replace or weaken the Permission / Confirmation / Audit gates**.

## 6. Acceptance Red Lines

- The backend `npm run check:boundary` must pass (CI gate)
- New frontend features only touch the Renderer; Core contract changes must update the corresponding protocol docs first
- `navigate-page.tool` route changes must sync all consumers
