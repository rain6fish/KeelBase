# EB-1 Demo: External CRM Integration (AI capability without replacing the system)

> **Enterprise Capability Bridge**: an enterprise's existing systems (CRM/ERP/OA) are not replaced — they become the **business-safe capability source** for AI agents. This demo takes an existing CRM system's OpenAPI description and connects it to KeelBase via the AI Bridge (`--import-openapi-proxy`) — AI reads external customers/orders under governance (R1 automatic), writes back follow-up tasks / price changes (R3 requires human confirmation), fully audited and revocable.
> The flagship showcase for the "China enterprise AI enhancement layer" route (roadmap §22.7 / §22.11 EB-1).

## In One Sentence

> **Give a decade-old business system AI capability without rebuilding it — AI can read, write, audit and revoke, all inside governance boundaries.**

## Prerequisites

- Node.js ≥ 22 (only to generate the proxy config; no backend needed)
- Optional: backend running (`npm run start:dev`) + Admin Console to see the full loop

## Quick Start

```bash
# One command generates the external CRM B-path Proxy tools (read=R1 write=R3) + shows governance grading
./scripts/demo-external-crm.sh

# Or write the config into the backend Settings first (backend must be running; tools take effect after restart)
./scripts/demo-external-crm.sh --apply
```

## Generated Tools

| Tool | External system op | Risk level | Governance |
|---|---|---|---|
| `list_customers` | GET /customers | R1 | Automatic (read) |
| `get_customer` | GET /customers/{id} | R1 | Automatic (read) |
| `list_customer_orders` | GET /customers/{id}/orders | R1 | Automatic (read) |
| `create_followup_task` | POST /customers/{id}/followups | **R3** | **Requires human confirmation** (write) |
| `update_order_amount` | PATCH /customers/{id}/orders/{orderId} | **R3** | **Requires human confirmation** (write) |

> Write operations are marked `x-keelbase-risk-level: R3` — the operations enterprises care most about ("AI changes a price / creates an order") must be confirmed by a human, never executed silently.

## Business Loop (user's perspective)

```
You: "Which customers are worth following up?"

AI:
  1. Read external customers (list_customers, R1 automatic)
  2. Read customer orders (list_customer_orders, R1 automatic) — overdue/amount analysis
  3. Risk analysis → suggest creating a follow-up task (create_followup_task)
  4. Request your confirmation (R3 write gate) — no confirm, no execution
  5. Confirm → write back to the external CRM (proxy_call side-effect registered)
  6. Audit hash chain + revocable (B-path Java compensation / revokePath)
```

## Governance Highlights (the key difference)

- **No silent writes**: external-system write operations (create follow-up / change price) require human confirmation (R3)
- **Auditable side effects**: proxy_call side effects are registered and visible in the Admin Console AI behavior timeline (EB-2 "external system (B path)" tag)
- **Revocable**: revocation goes through the B-path Java compensation endpoint (revokePath), or honest semantics
- **Full-chain audit**: decision trace + permission rationale (Why) + audit hash chain (tamper-evident)

## Why Not Just Rebuild a CRM

| | Traditional CRM replacement | KeelBase Bridge |
|---|---|---|
| System | Replace/rebuild | **Keep**, connect |
| Data | Migrate | Stay in place |
| AI writes | Ungoverned | R3 human confirmation + side effects + revocable |
| Audit | None/weak | Decision trace + hash chain |

## Related

- [ai-bridge.md](ai-bridge.md) — AI Bridge (Java legacy integration, B path)
- [aiization-demo.md](aiization-demo.md) — existing-system AIization (SQL/OpenAPI → Protocol → module)
- [framework-adapter-en.md](framework-adapter-en.md) — Agent Framework governance integration (AR-2)
- [flagship-applications-en.md](../flagship-applications-en.md) — AI CRM flagship spec
