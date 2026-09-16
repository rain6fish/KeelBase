# Build an AI Business Module in 30 Minutes (Onboarding)

> Goal: within **30 minutes**, generate a business module (invoices) that **AI can operate safely**.
> Copy and paste the commands below — each step shows the expected output. **No 20-minute README required.**
> For the internal technical flow, see [30min-acceptance-en.md](30min-acceptance-en.md); for the time-boxed challenge, see [dev-challenge-en.md](dev-challenge-en.md).

## What You Get

`keelbase init --spec specs/invoices.json` generates an **invoices** module (backend + AI tools + 4 client targets) in one command:

- Backend CRUD (entity / dto / service / controller / module) + CASL owner-only permissions + global audit
- **AI tools auto-generated (governance by default)**: `query_invoices` (read, **R1 auto-allowed**, filtered to your own rows by userId) + `create_invoice` (write, **R3 requires human confirmation** + verified email) — operating the module's **own** table, with permission / confirmation / audit / revoke needing **no hand-written code**
- Client pages wired automatically: Flutter / Web workbench / Taro + routing / navigation / i18n
- The generated output is **plain source code** you can keep editing

> Why not `customers`? — `customers` collides with the built-in AI CRM flagship (its `query_customers` tool already exists): generation is refused (or, if forced, silently reuses the flagship tools and the demo reads the wrong data). **Pick a name that collides with nothing** (e.g. invoices / products / orders).

## 0. Prerequisites (≈5 min)

```bash
git clone https://github.com/rain6fish/KeelBase.git && cd KeelBase
cd Server-NestJS && npm install
cp .env.example .env    # the repo does not commit .env (it holds secrets) — copy the template
```

> Installing only the backend is enough for this build loop. To see the UI, also install Web-Admin-Vue (`cd Web-Admin-Vue && npm install`).
> **Without `.env`, `npm run start:dev` fails validation on the missing JWT_SECRET / ENCRYPTION_KEY** — copy the template first.

## 1. Generate the AI Business Module (≈1 min)

```bash
cd ..   # back to the repo root (step 0 entered Server-NestJS; scripts/ lives at the root)
node scripts/keelbase-init.mjs --spec specs/invoices.json
```

Expected output: `生成业务模块 invoices` (generated module: invoices) + the wiring checklist (app.module / ai.module (query+create tools) / modules-manifest / navigate-page ...).

## 2. Build + Create DB (≈3 min)

```bash
cd Server-NestJS && npm run build
npm run start:dev     # first start creates the SQLite DB (synchronize builds tables) + seeds demo accounts (alex/Alex@2026$Demo, admin/Admin@2026$KeelBase), Ctrl+C when ready
```

> Development mode uses `synchronize` and creates tables (including the freshly generated `invoices`) — **no hand-written migration needed**. Production deployments (`synchronize:false` + `migrationsRun`) go through migrations.

## 3. Test (≈1 min)

```bash
npm test -- invoices
```

Expected output: **22 passed** (invoices.service + invoices.controller + query-invoices/create-invoices tools — all owned by the generated module).

## 4. Start Backend + Ask AI (≈10 min, optional LLM environment)

```bash
npm run start:dev    # http://localhost:3000, Swagger at /api/docs
```

Sign in to the workbench as `alex / Alex@2026$Demo`, then in the AI chat:

- "**Show me my invoices**" → AI calls `query_invoices` (blue "read" tool card)
- "**Create an invoice: INV-001, 8000, issued**" → AI calls `create_invoice` (orange "write" tool card) → **confirmation dialog** → confirm → persisted → "confirmed · revocable"

> **No LLM key configured?** The runtime falls back to deterministic demo mode, which routes generated-module writes by an explicit `param=value` phrase using the spec's camelCase field names — e.g. "创建发票 invoiceNo=INV-002". The flagship CRM golden path works without any key.
>
> Without an LLM environment you can also skip this step entirely — the deterministic loop (generate → build → test → tool registration) already proves the module works.

## 5. Acceptance (you're done)

- ✅ `query_invoices` / `create_invoice` registered as AI tools (`grep CreateInvoiceTool src/ai/ai.module.ts`)
- ✅ Ownership: the list endpoint returns only your own rows (a second account sees an empty list, not another user's invoices). Generated modules expose no `GET /:id`, so prove it through the list endpoint. Note that write attempts by an unverified account are refused earlier with `EMAIL_NOT_VERIFIED`.
- ✅ AI tool writes → AI audit + side-effect records (incl. confirmation decisions); REST human writes → operation audit (both hash-chain verifiable; `GET /audit/operations/verify` verifies the operation-audit chain)
- ✅ The output is plain source code you can keep modifying

## Common Failures

| Symptom | Fix |
|---|---|
| `目录已存在` (directory exists) | Module name conflict (may collide with an existing/flagship module) — use another English name |
| `目标文件已被占用` (target files already taken) | The name collides with existing tools (e.g. `customers`) — pick a different module name |
| `start:dev` fails with `Config validation error: JWT_SECRET is required` | `.env` not copied — run `cp .env.example .env` and restart |
| Same error after setting `NODE_ENV=development` | This repo ships only `.env` (**no `.env.development`**) — setting `NODE_ENV=development` makes it read a non-existent `.env.development`. Leave `NODE_ENV` unset, or create the matching `.env.<env>` first |
| `npm test -- invoices` runs fewer than 22 | Module not generated completely — re-run step 1 |
| Port 3000 already in use | Another service holds it — start with `PORT=3010 npm run start:dev` |
| Register API returns `nickname should not be empty` | The register endpoint requires `nickname` (alongside username / password / email) |
| enum field error | Provide 2-10 lowercase-English enum options |

## Related

- One-command full demo (AI CRM Golden Flow): [demo.sh](../../deploy/demo.sh) ([demo-deploy.md](demo-deploy.md))
- Time-boxed challenge: [dev-challenge-en.md](dev-challenge-en.md) · Internal technical flow: [30min-acceptance-en.md](30min-acceptance-en.md)
- Protocol examples: `specs/invoices.json` / `project.json` / `approval-request.json` / `supplier.json`
