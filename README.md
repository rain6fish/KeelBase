# KeelBase — Full-Stack Application Base Platform

> ### 🚀 Get Started in 60 Seconds
> **Docker only — one command brings up the full stack (backend + main App + Admin Console) using a published image, no build needed:**
> ```bash
> docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
> # Visit http://localhost:3000 (workbench / business web), /admin (Admin Console), /mobile (main App mobile preview)
> ```
> Build it yourself (when modifying code): `./scripts/docker-single.sh`
> Or local dev mode (backend + Admin Console, auto-opens browser):
> ```bash
> ./scripts/dev.sh experience
> ```
> See [Quick Start](docs/manual/quickstart-en.md) / [FAQ](docs/manual/faq-en.md).

> ### 🖥️ Live Demo (read-only, seed data)
> **Try the full-stack app without installing anything** — the Taro H5 main App with demo data (`alex / 123456`):
> - One-command local demo: `./deploy/demo.sh` → http://localhost:8080
> - Host your own online demo (DNS + static hosting + backend): [docs/manual/demo-deploy.md](docs/manual/demo-deploy.md)

**AI-Driven Enterprise Application Base — where AI does real work, only within your authorized data.**

> **Build and run business-safe AI applications.**

KeelBase is a business-safe, AI-native full-stack base for building enterprise apps. Dev-time AI generates business modules from protocols in minutes; runtime AI does real work — every tool call scoped to the user's data, every write human-confirmed, every action audited. Data stays on-prem; AI stays accountable. A deep base, not a wide platform.

### 🎯 North Star

> **60 seconds to understand · 10 minutes to run · 30 minutes to create.**

Everything ships along one main thread — **Build → Run → Trust → Private Deploy**:

- **Build** — *AI Application Engineering:* the system provides Application Protocols (conventions), AI generates the business modules — no low-code engine.
- **Run** — *Business-safe Agent Runtime:* runtime AI does real work — user-scoped tools, human-confirmed writes, full audit and revoke.
- **Trust / Private Deploy** — *Data Sovereignty:* data stays on-prem; AI stays accountable and reversible.

### Three Audiences

| | Developers | End Users | Owners & Admins |
|---|---|---|---|
| Core needs | A secure AI app in 30 minutes | AI does real work, not a toy | Trusted AI, controlled data, full audit trail |
| Capabilities | Dev-time AI (module generation + AI rules layer) | Runtime AI (chat / tools / memory / proactive) | Built-in governance (permissions / confirmation / audit / revoke / on-prem) |
| In a word | Fast, no wheel-reinvention | Works — only within your data | Data on-prem, AI fully traceable |

> These three roles are not three parallel selling points but three angles of validation on the same main thread — developers validate "can we build it fast", users validate "is the AI genuinely useful", and managers validate "is the AI safe and trustworthy".

---

## 🚀 Why KeelBase?

Unlike traditional boilerplates that focus only on CRUD, KeelBase is engineered for the **AI era** and **enterprise compliance**.

### 🤖 AI-Native — Dev-Time + Runtime Dual Narrative

- **Dev-Time AI:** Dialogue-driven business-module generation (entity / DTO / CRUD / pages / permissions) plus an AI rules layer (AGENTS.md) — developers use AI to build, not just to chat.
- **Runtime AI:** Deep integration of RAG, tool calling, data insights, long-term memory, sub-agents, and proactive services — the assistant actually does work, not just chat.

> **`keelbase init` is a code generator, not a low-code platform.**
> It generates real readable code (entity/DTO/CRUD/pages/permissions, committed to git, editable, AI-extensible) following KeelBase conventions; the LLM understands requirements (natural language → module spec) and extends the output. Deliberately no drag-and-drop / runtime-metadata engine — "the system provides conventions, AI does the generation".

### 🛡️ Business-Safe Agent Harness (main thread)

- **User-Scoped Tools:** Every tool call carries the authenticated user — AI can only touch that user's data.
- **Human Confirmation:** Write operations require explicit human approval before execution.
- **Audit & Revoke:** Full audit trails on every agent action; AI-created side effects are tracked and reversible.

### 🔒 Private & Secure (owner view)

- **Data Sovereignty:** Designed for private deployment — you keep full ownership of your data, not a cloud provider.
- **Enterprise-Grade Security:** Built-in CASL permission control, login lockout, token hashing, AES-256-GCM static encryption, and full audit trails.

### ⚡ Full-Stack Fusion

- **One Base, Three Ends:** Seamlessly integrates the user App (Flutter), Mini-Program (Taro), and an isolated Admin Console.
- **Zero-Friction Dev:** Unified API contracts and shared type conventions; the admin console stays fully isolated from the main app.

---

## Repositories / Directories

| Directory | Description |
|-----------|-------------|
| `Front-Flutter/` | Flutter app (iOS / Android / Web) — main user app |
| `Front-Taro/` | Taro H5 / mini-program app — main user app |
| `Web-Admin-Vue/` | Standalone admin console (Vue3 + Vuetify3 PC Web), fully isolated; React version planned |
| `Server-NestJS/` | NestJS backend (REST API) |
| `docs/` | Specs, requirements, manuals |
| `.github/workflows/` | CI pipeline (lint + test + build) |

---

## Quick Start

> 🚀 **Want to run the full stack in 5 minutes without reading code?** See [Quick Start](docs/manual/quickstart-en.md); stuck? See [FAQ](docs/manual/faq-en.md).

### Fastest Path: Single Container

**Verified (2026-08-13): one command brings up the full stack — backend API + Flutter main App + Vue3 Admin Console + demo accounts.**

#### 🐳 Use a published image (no build, fastest)

```bash
docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
# Visit http://localhost:3000 (workbench), /admin (Admin Console), /mobile (main App mobile preview)
# Demo accounts: alex/123456 (workbench + mobile preview), admin/Admin@1234 (Admin Console) — auto-created on first start
docker logs -f keelbase      # view logs
docker stop keelbase && docker rm keelbase   # stop & remove (data persists in named volume keelbase_data)
```

> Images are hosted on [ghcr.io](https://github.com/rain6fish/KeelBase/pkgs/container/keelbase) and auto-built/published on tag (`latest` + version). For production, override the JWT/encryption secrets with `-e`.

#### 🛠 Build it yourself (when modifying code)

```bash
./scripts/docker-single.sh         # build & start (first build ~10 min, includes frontend compile)
```

| Subcommand | Description |
|--------|------|
| `./scripts/docker-single.sh` / `up` | Build & start |
| `./scripts/docker-single.sh stop` | Stop the container |
| `./scripts/docker-single.sh down` | Stop & remove the container |
| `./scripts/docker-single.sh logs` | View logs |

> Just needs Docker. Zero-config SQLite (data persisted in `keelbase_data` volume), cache/queue auto-degrade. **Production**: prefer multi-container via `docker-compose.yml`, or override secrets/DB with `-e`.

### Alternative: Local Dev Script

```bash
./scripts/dev.sh experience    # local Node mode: backend + Admin Console, auto-verify + open browser
DOCKER=1 ./scripts/dev.sh experience   # or full Docker (use `make experience` if make is available)
```

> Auto port detection, auto-verify, prints demo accounts.

### Unified Commands

```bash
./scripts/dev.sh help      # all commands (experience / dev / test / build / migrate …)
make help                 # equivalent (with make)
```

### Local Dev Path

```bash
./scripts/dev.sh dev        # backend only (zero-config SQLite, cache/queue auto-degrade)
./scripts/dev.sh web        # Flutter Web
./scripts/dev.sh dev-admin  # build & serve Admin Console
```

#### Prerequisites
- Node.js >= 22
- Flutter SDK >= 3.12
- npm

### Backend

```bash
cd Server-NestJS
cp .env.example .env
npm install
npm run start:dev
```

Server: http://localhost:3000  
API docs (Swagger): http://localhost:3000/api/docs  
Health check: http://localhost:3000/api/v1/health

> Dev DB is zero-config SQLite (`./data/front.sqlite`). Switch to PostgreSQL for production via `DB_TYPE=postgres`. First dev start auto-creates demo accounts (`alex`/`admin`).

### Flutter Frontend

```bash
cd Front-Flutter
flutter pub get
flutter run            # mobile/desktop
flutter run -d chrome  # web
```

Frontend defaults to `http://localhost:3000/api/v1`.

### Admin Console

The Admin Console is bundled with the main App at `/admin` after one-command deploy (no separate deployment needed):

- **Production / one-command deploy**: `http://<server>/admin`
- **Local**: `./scripts/dev.sh dev-admin` starts the Vite dev server → http://localhost:10086/admin/
- **Standalone domain**: `cd Web-Admin-Vue && npm ci && npm run build`, host `dist/` (base=/admin/)

> Admin Console requires an account with `role = admin`. See [Demo Account](#demo-account).

### Docker (Production)

```bash
docker compose up --build
# production HTTPS:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Starts PostgreSQL 17 + Redis + NestJS API + Nginx (Web workbench at `/`, Admin Console at `/admin`, Flutter mobile preview at `/mobile`).

---

## Demo Account

Seed data (dev only) creates both accounts automatically on first backend start.

| Role | Username | Password | Purpose |
|------|----------|----------|------|
| User | `alex` | `123456` | Regular user (main App) |
| Admin | `admin` | `Admin@1234` | Administrator (Admin Console) |

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|--------------|
| Frontend | Flutter 3.x (Material 3, Provider, Dio) + Taro 3.6 (React, zustand) | Main App (3 platforms) + H5/mini-program |
| Backend | NestJS 11.x, TypeScript, TypeORM | Modular, decorator-driven |
| Database | SQLite (dev) / PostgreSQL (prod) | Dev / production |
| Cache / Queue | Redis 7 + CacheManager (Redis) + BullMQ | Cache layer + async queue |
| Auth | JWT access/refresh rotation, bcrypt, login lockout, OAuth (WeChat / Alipay / Google / Apple), email verification, multi-device sessions | Rotation + brute-force protection + OAuth + multi-device sessions |
| Authorization | CASL ability-based permissions (role + row-level) | Role + row-level |
| AI | OpenAI-compatible LLM providers (DeepSeek / Qwen / OpenAI), tool calling, RAG knowledge base, conversation & audit persistence | Tool calling + RAG + conversation & audit persistence |
| Notifications | In-app notifications + SSE realtime + JPush (abstracted) | In-app + SSE realtime + push abstraction |
| Email | nodemailer + SMTP (verification / reset / notification templates) | Verification / reset / notification templates |
| Storage | Local disk / S3-compatible (MinIO, OSS) + sharp image processing (WebP) | Local / S3-compatible + WebP |
| Observability | pino structured logs, Prometheus metrics (`/metrics`), OpenTelemetry traces, Loki logs, Grafana, Jaeger | Logs / metrics / traces |
| API | RESTful, versioned (v1), Swagger documented, rate-limited | Versioned + docs + rate limiting |
| Deploy | Docker, Nginx, CI (GitHub Actions) | Containerized + automated |

---

## Key Features

- **Auth**: register, login, JWT rotation, auto-login, token refresh, OAuth third-party login, forgot/reset password, email verification, multi-device session management
- **Events**: week/month views, agenda list, event CRUD (per-user ownership via CASL)
- **AI Assistant**: chat with tool calling (query events / user stats / navigate pages), RAG knowledge base Q&A, data insights, model hot-switch (DeepSeek/Qwen), conversation history
- **Notifications**: in-app notification center, unread count, SSE realtime push, JPush device push (abstracted)
- **Admin Console**: isolated Vue3 PC Web app — user management (roles, delete), event management, knowledge base, AI audit logs & usage stats, operation audit, monitoring, templates, AI eval, tool effects
- **Search**: events + public users unified search
- **Upload**: MIME + extension + magic-byte validation, 10MB limit, WebP conversion
- **Security**: Helmet, CORS whitelist, body limit, sort-injection guard, login lockout, token hashing, CASL row-level permission, AES-256-GCM static encryption
- **Observability**: structured JSON logs, Prometheus metrics, OpenTelemetry tracing, Loki log collection, alert rules
- **Ops**: backup/restore scripts, Redis cache, BullMQ async queue

---

## Documentation

| File | Audience | Purpose |
|------|----------|---------|
| [`docs/manual/quickstart-en.md`](docs/manual/quickstart-en.md) | Everyone | Quick Start (English, 5-min full stack) |
| [`docs/manual/tutorial.md`](docs/manual/tutorial.md) | Everyone | Zero-to-deploy tutorial: run → configure → deploy (Chinese) |
| [`docs/manual/faq-en.md`](docs/manual/faq-en.md) | Everyone | FAQ — troubleshooting (environment / startup / accounts / AI / deploy) |
| [`docs/manual/quickstart.md`](docs/manual/quickstart.md) | Everyone | 快速上手 (Chinese) |
| [`docs/manual/faq.md`](docs/manual/faq.md) | Everyone | 常见问题排查 (Chinese) |
| [`AGENTS.md`](AGENTS.md) | AI agents | Layered AI rules — new business module checklist |
| [`CLAUDE.md`](CLAUDE.md) | AI agents | Full architecture spec, conventions, security rules |
| [`docs/manual/usage.md`](docs/manual/usage.md) | End users | Usage manual — feature URLs & common operations (EN/ZH) |
| [`docs/manual/development.md`](docs/manual/development.md) | Developers | Development manual — architecture, patterns, testing |
| [`docs/manual/operations.md`](docs/manual/operations.md) | Ops | Operations manual — deploy, env vars, migration, observability |
| [`docs/manual/one-click-deploy.md`](docs/manual/one-click-deploy.md) | Ops | One-click cloud server deployment (on-prem) |
| [`docs/manual/offline-deploy.md`](docs/manual/offline-deploy.md) | Ops | Intranet / offline deployment |
| [`docs/manual/private-ai-verification.md`](docs/manual/private-ai-verification.md) | Ops | Private AI verification — data-stays-on-prem closed loop (Ollama / local embedding / RAG / audit) |
| [`docs/project.spec.md`](docs/project.spec.md) | Developers | Project specification |
| [`docs/ai-agent.spec.md`](docs/ai-agent.spec.md) | Developers | AI assistant feature spec |
| [`docs/enterprise-capabilities.md`](docs/enterprise-capabilities.md) | Enterprise buyers | Enterprise capability statement — capability + evidence + compliance path |
| [`docs/enterprise-readiness.md`](docs/enterprise-readiness.md) | Enterprise buyers | Enterprise readiness checklist — status / gaps / priorities |
| [`SECURITY.md`](SECURITY.md) | Everyone | Security policy — supported versions / vulnerability reporting / built-in security / SBOM |
| `Server-NestJS/.env.example` | Developers | Environment variables reference |
