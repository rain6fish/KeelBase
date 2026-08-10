# Quick Start — Run the Full Stack in 5 Minutes

> Goal: get **backend + main app + admin console** running with **zero code reading**, then log in with demo accounts.
> Every step has a "how to verify" and "if stuck". New to the repo? Start here.

---

## What You'll Get

| End | URL | What it does |
|-----|-----|--------------|
| Backend API | http://localhost:3000 | All APIs + Swagger docs |
| Main App (Web) | port shown after `flutter run` | Register/login, events, todos, AI assistant |
| Admin Console | http://localhost:10086 | User/event management, audit, monitoring (admin account) |

**Fastest path (only needs Docker):**

```bash
./deploy/experience.sh          # one-shot: start backend + admin, print accounts & URLs
# or full Docker:
DOCKER=1 ./deploy/experience.sh
```

---

## 1. Fastest Path: Docker One-Click

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows) / Docker Engine + Compose (Mac/Linux).
2. Verify: `docker --version`.
3. Start everything:

```bash
docker compose up --build -d    # first build ~10 min
```

4. Verify: open http://localhost:3000/api/v1/health → `{"status":"ok"}`; open http://localhost.

**Stuck?** Port busy → change `ports` in `docker-compose.yml`. Slow pulls → configure a Docker registry mirror.

## 2. Local Dev Path (to modify code)

### Backend

```bash
cd Server-Nodejs
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

### Admin Console (Taro H5)

```bash
cd Front-Taro-Admin
npm install
npm run build:h5              # static output → dist/
# serve dist/ with any static server
npx http-server dist -p 10086
```

✅ Verify: http://localhost:10086 → log in with `admin / Admin@1234`.
⚠️ Always use `build:h5` (not `dev:h5`, which can crash on some Node versions).

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
