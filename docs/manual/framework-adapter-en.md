# Agent Framework Integration Verification (AR-2, MCP as the Adapter)

> **Positioning (roadmap §22.2 ecosystem convergence)**: KeelBase = an **Enterprise AI Trust Runtime** on top of AI frameworks — it does not re-build orchestration. Any mainstream Agent Framework (LangChain / OpenAI / Claude etc.) integrates via **MCP (open standard)** and automatically enters the KeelBase governance layer: Identity / Permission / Confirmation / Audit all work. This page demonstrates and verifies that "MCP-as-Adapter" chain.

## Why MCP

The Agent-Runtime-Adapter analysis (adopted 2026-08) concluded: **the correct framework adapter is an open-standard entry point, and MCP is already the best adapter** — no official SDK per framework needed; the protocol layer unifies. Official SDK adapters are downgraded to "verification + documentation" rather than new code.

## The Chain

```text
Agent Framework (any MCP-compatible)
   ↓ MCP over HTTP (JSON-RPC: initialize / tools/list / tools/call)
POST /api/v1/mcp (HS-10 export, @Raw raw JSON-RPC)
   ↓ as the caller's JWT identity (Identity)
executeToolForExternal (own-data scope, CASL)
   ↓ Permission / Confirm (write tools require human confirmation)
KeelBase governance + AI audit (provider=mcp)
```

## Verification Script

```bash
# Prereq: backend running + seeded (has CRM data)
cd Server-NestJS && npm run seed:demo

# No LLM dependency (read-tool query + confirmation gate are deterministic)
node scripts/verify-framework-adapter.mjs
# BASE=... DEMO_USER=... DEMO_PASS=... override defaults (localhost:3000 + alex/Alex@2026$Demo)
```

The script verifies 5 dimensions:

| # | Governance dimension | Verification point |
|---|---------|--------|
| 1 | **Identity** | JWT sign-in; tools/call executes as the caller |
| 2 | **Protocol + capability** | MCP initialize handshake + tools/list returns the tool list |
| 3 | **Permission** | read tool (query_customers) succeeds as the user (own-data scope) |
| 4 | **Confirmation** | write tool (create_customer) triggers the confirmation gate; unconfirmed → not executed (HS-10) |
| 5 | **Audit** | every tools/call lands in the AI audit (provider=mcp) |

## Relationship to Other Docs

- [hs10-mcp-adapter.spec.md](../hs10-mcp-adapter.spec.md) — MCP export protocol spec (initialize/tools/list/tools/call + governance wiring)
- `test/mcp-export.e2e-spec.ts` — MCP export e2e (protocol layer)
- `verify-golden-application.sh` — Gate 1 AI CRM end-to-end (business loop)
- `synthetic-stranger.md` — external-developer onboarding (incl. the Java team P2 persona)

## Acceptance Criteria

- ✅ MCP export exists (HS-10): initialize/ping/tools/list/tools/call, @Raw raw JSON-RPC
- ✅ Tools execute as the caller (executeToolForExternal + CASL own-data scope)
- ✅ Write-tool confirmation gate (unconfirmed → not executed, audit isError=false)
- ✅ MCP calls land in the AI audit (provider=mcp distinguishes the source)
- 🔶 Framework integration verification script provided (`verify-framework-adapter.mjs`), needs a real server environment to run
