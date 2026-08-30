# Developer 30-Minute Challenge (Dev Challenge / Phase 3 Acceptance Pack)

> A reproducible challenge for external developers: **build a business module that "AI can safely operate" with KeelBase within 30 minutes**.
> This verifies KeelBase's acceptance standard (60s to understand / 10min to run / 30min to create) on an external developer — it's not a demo, it's "you really can do it".
> Internal execution version: [30min-acceptance-en.md](30min-acceptance-en.md).

---

## The Challenge

> Use `keelbase init` to generate a business module from scratch (e.g., "supplier management"), and let the **Runtime Agent (AI chat) safely operate it** — reading/writing your data, writes requiring your confirmation, every step auditable.

## Setup (≈10 min)

```bash
# Option A: single container (Docker only, fastest)
docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
# Visit http://localhost:3000 (workbench), /admin (Admin Console); demo accounts alex/Alex@2026$Demo

# Option B: local development (to change code)
git clone <repo> && cd KeelBase && cd Server-NestJS && npm install
```

## The Challenge (30 minutes, time-boxed)

| Time | Task | Verification point |
|---|---|---|
| 0-5min | Write the protocol: `specs/supplier.json` (name/status enum/riskLevel enum) or a one-line description | Protocol file ready |
| 5-8min | Generate: `node scripts/keelbase-init.mjs --spec specs/supplier.json` | Output "generated module" + multi-client wiring ✓ |
| 8-12min | Compile + migrate: `cd Server-NestJS && npm run build && npm run migration:generate -- src/migrations/AddSupplier` (**note**: a fresh clone has no SQLite DB — `migration:generate` will dump the full schema on an empty DB — **start the backend once with `npm run start:dev` first**, then generate to get the incremental AddSupplier migration; production postgres follows the same migration path) | 0 error + migration generated |
| 12-15min | API verification: start backend, `curl /api/v1/suppliers` (with token) | 200 + own data |
| 15-20min | **AI tool**: in the AI chat type "show me my suppliers" → observe the `query_suppliers` read tool card (blue "read" badge) | Runtime Agent calls the generated module |
| 20-25min | **Write confirmation**: in the AI chat type "create a supplier" → write tool card (orange "write") + confirmation dialog → confirm → persisted → "confirmed · revocable" | Human confirmation for writes |
| 25-30min | **Audit + permissions**: check this call in the Admin Console "AI audit" (hash chain verifiable); another account accessing → 403 | Full-chain audit + cross-user rejection |

**Completion standard**: the generated module has permissions + AI tools + confirmation + audit, and AI can safely operate your module.

## Reusable Resources

| Resource | Description |
|---|---|
| Three-flagship templates (one-click import in Admin Console) | `crm-demo` (customers/risk) / `pm-demo` (projects/deadline) / `approval-demo` (approvals/policies) |
| Business skills | `crm-customer-risk` / `pm-deadline-risk` / `approval-policy-review` (AI business rules) |
| Protocol examples | `specs/customer.json` / `project.json` / `approval-request.json` / `supplier.json` |
| Plugin CLI | `node scripts/keelbase-plugin.mjs add <plugin.ts>` to register extensions |

## Feedback Form (fill in when submitting your result)

| Field | Fill in |
|---|---|
| Where stuck | Which step exceeded its time budget? |
| Why stuck | Missing docs / unintuitive API / bad tooling / environment issue? |
| Missing abstraction | Something you wish KeelBase provided but doesn't yet? |
| Time taken | Actual duration + whether it met the 30-minute standard |
| One-line verdict | The most delightful / most painful point |

## Related

- [30min-acceptance-en.md](30min-acceptance-en.md) — internal execution version (10 steps + verify commands)
- [quickstart-en.md](quickstart-en.md) — quick start
- [ecosystem-pack.md](ecosystem-pack.md) — ecosystem pack assembly (templates/skills/plugins/generator)
