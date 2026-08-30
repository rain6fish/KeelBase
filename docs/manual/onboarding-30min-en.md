# Build an AI CRM in 30 Minutes (Onboarding)

> Goal: generate a **customer management (AI CRM) module that AI can safely operate** within **30 minutes**.
> Just copy and paste the commands below — each step shows the expected output. **No 20-minute README required.**
> For the internal technical flow, see [30min-acceptance-en.md](30min-acceptance-en.md); for the time-boxed challenge, see [dev-challenge-en.md](dev-challenge-en.md).

## What You Get

`keelbase init --spec specs/customer.json` generates a **customers** module (backend + AI tools + 4 client targets) in one command:

- Backend CRUD (entity / dto / service / controller / module) + CASL owner-only permissions + global audit
- **AI tools auto-generated**: `query_customers` (read) + `create_customers` (write, requires human confirmation)
- Client pages wired automatically: Flutter / Web workbench / Taro + routing / navigation / i18n
- The generated output is **plain source code** you can keep editing

## 0. Prerequisites (≈5 min)

```bash
git clone https://github.com/rain6fish/KeelBase.git && cd KeelBase
cd Server-NestJS && npm install
```

> Installing only the backend is enough for this build loop. To see the UI, also install Web-Admin-Vue (`cd Web-Admin-Vue && npm install`).

## 1. Generate the AI CRM Module (≈1 min)

```bash
node scripts/keelbase-init.mjs --spec specs/customer.json
```

Expected output: `生成业务模块 customers` (generated module customers) + the wiring checklist (app.module / ai.module (query+create tools) / modules-manifest / navigate-page ...).

## 2. Build + Create DB + Migrate (≈3 min)

```bash
cd Server-NestJS && npm run build
npm run start:dev     # first start creates the SQLite DB + seeds demo accounts (alex/Alex@2026$Demo, admin/Admin@2026$KeelBase), Ctrl+C when ready
npm run migration:generate -- src/migrations/AddCustomers   # incremental migration (start the backend once first — see common failures)
npm run migration:run
```

## 3. Test (≈1 min)

```bash
npm test -- customers
```

Expected output: **20 passed** (service 5 + controller 6 + query/create tools 9).

## 4. Start Backend + Ask AI (≈10 min, optional LLM environment)

```bash
npm run start:dev    # http://localhost:3000, Swagger at /api/docs
```

Sign in to the workbench as `alex / Alex@2026$Demo`, then in the AI chat:

- "**Show me my customers**" → AI calls `query_customers` (blue "read" tool card)
- "**Create a customer: Zhang San, lead**" → AI calls `create_customers` (orange "write" tool card) → **confirmation dialog** → confirm → persisted → "confirmed · revocable"

> No LLM environment? Skip this step — the deterministic loop (generate → build → test → tool registration) already proves the module works.

## 5. Acceptance (you're done)

- ✅ `query_customers` / `create_customers` registered as AI tools (`grep CreateCustomersTool src/ai/ai.module.ts`)
- ✅ Cross-user access to another user's customer data → 403
- ✅ Writes land in the operation audit + AI calls land in the AI audit (hash chain verifiable, `GET /audit/operations/verify`)
- ✅ The output is plain source code you can keep modifying

## Common Failures

| Symptom | Fix |
|---|---|
| `目录已存在` (directory exists) | Module name conflict — use another English name or `--force` to overwrite |
| Migration generates a full dump | Fresh clone has no SQLite DB — **start the backend once (`npm run start:dev`) first**, then generate the incremental migration |
| `npm test -- customers` only runs 16/20 | Module not generated completely — re-run step 1 |
| enum field error | Provide 2-10 lowercase-English enum options |

## Related

- One-command full demo (AI CRM Golden Flow): [demo.sh](../../deploy/demo.sh) ([demo-deploy.md](demo-deploy.md))
- Time-boxed challenge: [dev-challenge-en.md](dev-challenge-en.md) · Internal technical flow: [30min-acceptance-en.md](30min-acceptance-en.md)
- Protocol examples: `specs/customer.json` / `project.json` / `approval-request.json` / `supplier.json`
