# From Zero to Deployment (DX-2)

> This guide walks you from "never ran KeelBase" to "deployed in production" along one complete path in six steps, each with a verification:
> **Run it → Understand it → Make it yours → Generate a new module → Deploy → Operate**.
> For first-time users. For specific questions, see the [FAQ](faq-en.md) or the manual index.

## Step 1: Run It (≈5 min) — RUN

**Only prerequisite: Docker.** KeelBase ships a published single-container image — one command brings up the full stack (backend + main app + Admin Console + demo accounts):

```bash
docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
```

**Verify** (open in browser):

| URL | What you see |
|------|---------|
| http://localhost:3000/api/v1/health | `{"status":"ok"}` |
| http://localhost:3000 | Workbench (web business UI, root redirect) |
| http://localhost:3000/mobile | Mobile main-app preview (Flutter) |
| http://localhost:3000/admin | Admin Console (Vue3) |

**Sign in** (auto-created on first start):

| Account | Password | Purpose |
|------|------|------|
| `alex` | `Alex@2026$Demo` | Workbench / mobile preview normal user |
| `admin` | `Admin@2026$KeelBase` | Admin Console administrator |

> See logs: `docker logs -f keelbase`; stop and remove: `docker stop keelbase && docker rm keelbase` (data stays in the named volume `keelbase_data`).
> To modify code, use local development: `./scripts/dev.sh experience` (starts backend + Admin Console, opens the browser). See [Quick Start](quickstart-en.md).

## Step 2: Understand It (≈3 min) — UNDERSTAND

Once it's running, four actions quickly show that "AI isn't just chat — it works inside permission and audit boundaries":

1. **Explore data via AI chat**: on the mobile preview (/mobile) open the bottom "AI" page and type "what events do I have this month?" — the AI calls a query tool and returns your real data (not small talk).
2. **See the capability list**: visit `/app/capabilities` (or Admin Console "System info") — which features the current preset (full / small / lite) enables, and the frontend navigation matches it.
3. **See the audit**: Admin Console "AI audit" / "Operation audit" — that AI tool call you just made is already recorded (who, which tool, result); write operations (e.g., creating an event) also require human confirmation.
4. **Quick data-model tour**: core entities `User / Event / Todo / Notification` — all business is isolated around "own data" (CASL row-level permissions).

> Understanding this layer is understanding KeelBase's differentiator: a **business-safe Agent harness** — AI gets work done, touches only your data, and every step is auditable.

## Step 3: Make It Yours (config) — MODIFY

First `cd Server-NestJS && cp .env.example .env`, then adjust as needed:

### 3.1 Security keys (must change)

| Variable | Description |
|------|------|
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | JWT signing secrets, at least 32 chars, generate with `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Static encryption key for sensitive data (phone / providerId), 32-byte hex |

> In production, deploy.sh generates random keys automatically — no manual entry. For local development `.env.example` already carries defaults that run out of the box.

### 3.2 Database

- **Development**: `DB_TYPE=sqlite` (default, zero config, data in `Server-NestJS/data/`)
- **Production**: `DB_TYPE=postgres` + `DB_HOST/PORT/USER/PASSWORD` (migrations run automatically, see [Operations](operations.md) §Migrations)

### 3.3 AI capability (optional — AI degrades gracefully if not configured)

| Variable | Description |
|------|------|
| `AI_PROVIDER` | `deepseek` / `qwen` / `openai` (or `ollama` for private/local) |
| `DEEPSEEK_API_KEY` | The model key matching `AI_PROVIDER` |
| `OLLAMA_BASE_URL` | Auto-registers the ollama provider for private deployment (data stays in your perimeter) |

### 3.4 Feature flags and presets

```bash
# Default full (everything on); small disables external integrations (push/sms/oauth); lite also disables search and generated modules
APP_PRESET=full        # full | small | lite
FEATURE_ORG_ENABLED=false   # explicit flag overrides the preset (corresponds to FEATURE_<KEY>_ENABLED)
```

Disabled features' APIs return 404, and the frontend navigation auto-hides them based on `/app/capabilities`.

### 3.5 Create an admin and seed data

```bash
cd Server-NestJS
npm run create:admin   # interactive admin creation (idempotent — re-running says it already exists)
npm run seed:demo      # seeds demo data on an empty DB (events / todos / points etc.)
```

### 3.6 Rebrand

Use the generator's `--brand` to replace the project name:

```bash
node scripts/keelbase-init.mjs --brand YourProjectName
```

> One-place logo / primary color / domain configuration is tracked in roadmap EASY-3 (in progress); `--brand` already supports the project-name replacement.

## Step 4: Generate a New Business Module (≈10 min) — GENERATE

Dialogue-generate a "books" module (auto-wires 7 points: app.module / modules-manifest / feature-flags / main.dart / app_router / i18n / navigate-page.tool, including Web-Admin):

```bash
# From the repo root
node scripts/keelbase-init.mjs --module books --label Books --fields title:string,author:string
```

**Required after generation** (don't stop at running the CLI):

1. **Verify compile**: `cd Server-NestJS && npm run build`
2. **Run generated module tests**: `npm test -- books.service`
3. **Generate migration** (needed for production postgres; TypeORM indexes use hash names — never hand-write): `npm run migration:generate -- src/migrations/AddBooks`
4. **Verify frontend**: `cd Front-Flutter && flutter analyze`
5. **Confirm AI navigation**: `src/ai/tools/navigate-page.tool.ts`'s `PAGE_ROUTES` includes the new page

**Verify**: after signing in, the "books" module appears in Explore/navigation, and the AI chat can navigate to it.

> Complex / non-standard modules: follow [AGENTS.md](../../AGENTS.md) "AI must-do checklist" to add manually (7 wiring points + tests + migration), or let AI generate per the conventions. The generator is a **code generator, not a low-code platform** — it produces real, readable, editable code that AI can keep extending.

## Step 5: Private Deployment (cloud server) — DEPLOY

The deploy script: installs Docker → starts Compose (PostgreSQL + Redis + backend + Nginx) → configures HTTPS → auto-generates random keys → creates the admin.

```bash
# 1. Upload the project to the cloud server (or clone), enter the directory
# 2. Run the deploy script
./deploy/deploy.sh
```

**Verify**: open `https://yourdomain` (workbench) + `https://yourdomain/mobile` (mobile preview) + `https://yourdomain/admin` (Admin Console) in a browser, and sign in with the admin account printed by the script.

> Production HTTPS requires a certificate first: `mkdir certs && cp your-cert.crt certs/server.crt && cp your-key.key certs/server.key`. See [One-click Deploy](one-click-deploy.md).
> To try deployment quickly without a Docker environment, use the published image: `docker run -d -p 80:3000 ghcr.io/rain6fish/keelbase:latest` (in production override JWT/encryption keys with `-e`).
> Intranet / offline environments: `deploy-offline.sh` (preloaded images, external dependencies gracefully degraded), see [Offline Deploy](offline-deploy.md).

## Step 6: Daily Operations (brief) — OPERATE

| What you want to do | Command / doc |
|---------|------------|
| Back up / restore the database | `npm run backup` / `npm run restore -- <file>` (see [Operations](operations.md)) |
| Health check | `npm run healthcheck` (includes local resources and backup checks) |
| See runtime status | Admin Console "Monitor" / "Ops" pages; Grafana/Prometheus via the observability stack |
| Release / migrate | `npm run migration:generate` / `npm run migration:run` (see [Development](development.md)) |

## Common Questions

- Won't start / port in use / sign-in fails / AI not replying → see the [FAQ](faq-en.md) (environment / startup / accounts / AI / deployment topics).
- Want to add a new business module → [Development](development.md) + `node scripts/keelbase-init.mjs` (dialogue generation, security wiring included).

---

**Manual index** → back to [Manuals](README.md).
