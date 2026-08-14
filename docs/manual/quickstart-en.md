# Quick Start — Run the Full Stack in 5 Minutes

> Goal: get **backend + main app + admin console** running with **zero code reading**, then log in with demo accounts.
> Every step has a "how to verify" and "if stuck". New to the repo? Start here.

---

## What You'll Get

| End | URL | What it does |
|-----|-----|--------------|
| Backend API | http://localhost:3000 | All APIs + Swagger docs |
| Main App (Web) | port shown after `flutter run` | Register/login, events, todos, AI assistant |
| Admin Console | http://localhost:3000/admin (embedded in single container) / prod `http://<domain>/admin` | User/event management, audit, monitoring (admin account) |

**Fastest path (only needs Docker, single-container all-in-one):**

```bash
./scripts/docker-single.sh       # build & start: backend + main app + admin console in one container
# Visit http://localhost:3000 (main app), http://localhost:3000/admin (admin console)
```

> Just needs Docker. Zero-config SQLite, cache/queue auto-degrade. For local Node dev: `./scripts/dev.sh experience` (or `DOCKER=1 ./scripts/dev.sh experience` for full Docker). Other commands: `./scripts/dev.sh help` (or `make help`).

---

## 1. Fastest Path: Single-Container Docker One-Click

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows) / Docker Engine + Compose (Mac/Linux).
2. Verify: `docker --version`.
3. Start everything:

```bash
./scripts/docker-single.sh up   # first build ~5-10 min; embeds Flutter Web app + /admin
```

4. Verify: open http://localhost:3000/api/v1/health → `{"status":"ok"}`; open http://localhost:3000.
5. Log in with auto-created demo accounts:
   - Main app http://localhost:3000 → `alex` / `123456`
   - Admin console http://localhost:3000/admin → `admin` / `Admin@1234`

Manage the container: `./scripts/docker-single.sh logs | stop | down` (data persists in the `keelbase_data` volume).

> ✅ **Verified 2026-08-13**: one `docker run` brings up backend + main app + admin console + demo accounts; admin/alex login returns 200.

**Stuck?** Port busy → change ports in `docker-single.sh`, or use `./scripts/dev.sh experience` (auto-detects free ports). Slow pulls → configure a Docker registry mirror.

> Full compose (PostgreSQL + Redis + Nginx) production deploy: see the [Operations manual](operations.md).

## 2. Local Dev Path (to modify code)

### Backend

```bash
cd Server-NestJS
cp .env.example .env
npm install
npm run start:dev
```

✅ Verify: http://localhost:3000/api/v1/health → ok; http://localhost:3000/api/docs → Swagger.
⚠️ Dev DB is zero-config SQLite. First start auto-creates demo accounts.
> No Redis? Set `CACHE_ENABLED=false QUEUE_ENABLED=false` (or use `./deploy/experience.sh` which does this for you).

### Main App (Flutter Web)

```bash
cd Front-Flutter
flutter pub get
flutter run -d chrome
```

✅ Verify: login page appears; log in with `alex / 123456`.
⚠️ Requires [Flutter SDK](https://docs.flutter.dev/get-started/install) ≥ 3.12; backend must be running first.

### Admin Console (Vue3 PC Web)

```bash
cd Web-Admin-Vue
npm install
npm run dev                   # Vite dev server → http://localhost:10086/admin/
```

✅ Verify: http://localhost:10086/admin/ → log in with `admin / Admin@1234`.
Production: `npm run build` (base=/admin/, output dist/).

## 3. Demo Accounts

Auto-created on first backend start (development only):

| Role | Username | Password | Use |
|------|----------|----------|-----|
| User | `alex` | `123456` | Main app: events, todos, AI, notifications, search, upload |
| Admin | `admin` | `Admin@1234` | Admin console: user/event mgmt, audit, monitoring, broadcast |

**Suggested walkthrough:**
1. Main app → log in as `alex` → create an event → add a todo.
2. AI assistant → type "What events do I have this month?" (tests AI tool calling).
3. Admin console → log in as `admin` → Overview → User Management → AI Audit.

> ⚠️ Non-admin accounts get 403 on admin APIs — by design (permission isolation), not a bug.

## 3.1 What the Screens Look Like

**Main app home (logged in as alex)**

```
┌──────────────────────────────────┐
│ 👤 Alex          🔔              │  ← top: avatar / notification bell
│  Insights                        │
│  [Total 12] [Active 9] [Cancel 3] │  ← event stats card
│  📊 Events by month ▇▇▇▂▇        │  ← bar chart (last 12 months)
├──────────────────────────────────┤
│  📅 Today's Schedule  "Weekly sync 09:00" │
├──────────────────────────────────┤
│  🏠  📅  ⋯  ✦  🗒️               │  ← bottom nav: Home/Events/More/Discover/AI/Todos
└──────────────────────────────────┘
```

**Admin console overview (logged in as admin)**

```
┌──────────────┬─────────────────────────────┐
│ Sidebar       │  Overview                   │
│ Overview      │  [Users 2] [Events 0] [AI]  │  ← platform data cards
│ Data          │  📈 New users last 7d ▁▂▁▅▂  │
│  ├ Users      │  💾 Storage 1.2 KB          │
│  ├ Events     │  Quick links: Users/Events  │
│  ├ Knowledge  │  /Knowledge/Monitor/Audit   │
│  ├ Broadcast  │                             │
│ Monitor/Audit │                             │
│  ├ Monitor    │                             │
│  ├ AI Audit   │                             │
│  ├ Op Audit   │                             │
│  ├ Sessions   │                             │
│ System        │                             │
│  └ System     │                             │
└──────────────┴─────────────────────────────┘
```

**AI assistant (main app AI tab)**

```
┌──────────────────────────────────┐
│ AI Assistant      [Model: DeepSeek]│
│ ┌────────────────────────────┐  │
│ │ 🤖 What events this month? │  │
│ │ 📅 Querying events…        │  │  ← tool step card
│ │ ✅ 8 events this month: …  │  │
│ └────────────────────────────┘  │
│ [Input………………………………] [Send] │
└──────────────────────────────────┘
```

> Exact layouts may vary by version; these give you a mental map of where things are.

## 4. Common Pitfalls (full list in [FAQ](faq-en.md))

| Symptom | Cause | Fix |
|---------|-------|-----|
| Account locked | 10 failed logins | wait 15 min |
| No verification email | SMTP not configured | dev: skip the verification page |
| 403 on admin API | account not admin | use admin account |
| AI says "not configured" | no LLM API key | see FAQ "AI section" |
| App can't reach backend | backend down / port mismatch | start backend first; keep port 3000 |

## 5. Next Steps

| Want to… | Go to |
|----------|-------|
| Troubleshoot an issue | [FAQ](faq-en.md) |
| All features & endpoints | [Usage Manual](usage.md) |
| Write code / add features | [Development Manual](development.md) |
| Deploy to production | [One-Click Deploy](one-click-deploy.md) / [Offline Deploy](offline-deploy.md) |
| Operate the server | [Operations Manual](operations.md) |
