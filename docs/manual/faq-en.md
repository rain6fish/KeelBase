# FAQ — Common Problems

> Organized by topic, from real issues users hit. Didn't find yours? See [Quick Start](quickstart-en.md) or open an issue.

---

## 1. Environment

**Q: Which Node version?**
A: Backend requires **Node.js ≥ 22**. Check `node -v`. Too old → dependency install or startup fails.

**Q: Which Flutter version?**
A: **Flutter ≥ 3.12**. Run `flutter doctor` before `flutter run`.

**Q: Docker Compose not working?**
A: Modern Docker ships Compose v2 (`docker compose`). If only `docker-compose` (v1), upgrade Docker. Verify: `docker compose version`.

**Q: `python` command fails on Windows (exit 49 / Microsoft Store stub)?**
A: Windows `python` may be a Store placeholder. Install real Python (python.org), or use `npx http-server dist -p 10086` to serve static builds instead.

## 2. Startup & Ports

**Q: Backend won't start — port 3000 in use?**
A: Change `PORT` in `Server-Nodejs/.env`, and sync the port in `Front-Flutter/lib/core/constants/app_constants.dart`.

**Q: SQLite / database errors on startup?**
A: Dev uses zero-config SQLite (`Server-Nodejs/data/front.sqlite`), auto-created. Delete a corrupted file and restart.

**Q: Want PostgreSQL / Redis?**
```bash
docker compose up postgres redis -d
```
Then set `DB_TYPE=postgres` + DB_* in `.env`. Redis is optional — `CACHE_ENABLED=false` degrades gracefully.

**Q: App spinner forever / can't reach backend?**
1. Backend up? `curl http://localhost:3000/api/v1/health`
2. Ports match? Frontend defaults to `http://localhost:3000/api/v1`
3. Re-login if token expired.

## 3. Login & Accounts

**Q: "Account locked"?**
A: **10 consecutive failures → locked 15 min** (anti-brute-force). Wait, or restart backend in dev to reset.

**Q: Demo accounts? Why can't my registered account enter the admin console?**
A: Demo: `alex / 123456` (user), `admin / Admin@1234` (admin). Admin console requires the **admin role** — non-admins get 403. Promote a user via admin console → User Management → change role.

**Q: Not receiving verification / reset emails?**
A: Email needs SMTP (`MAIL_ENABLED=true` + `SMTP_*` in `.env`). **Dev works without SMTP** — registration proceeds, just no email; skip the verification page.

**Q: Where do SMS codes go?**
A: Default `SMS_DRIVER=console` prints codes to the backend console log. Real SMS needs `SMS_DRIVER=aliyun` + credentials.

## 4. AI

**Q: AI replies "not configured"?**
A: Set an LLM API key in `Server-Nodejs/.env`:
```bash
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your-key
```
Supports DeepSeek / Qwen / OpenAI (OpenAI-compatible). Without a key, AI chat is unavailable but navigation/insights still work.

**Q: Want a local model (data stays on-prem)?**
A: Use Ollama:
```bash
ollama pull qwen2.5:7b
ollama pull bge-m3
# .env: OLLAMA_BASE_URL=http://localhost:11434
#       AI_PROVIDER=ollama
```
See [Offline Deploy](offline-deploy.md) "On-prem AI".

**Q: How to switch models? Why is my model list small?**
A: The main app AI page has a model selector (DeepSeek/Qwen). Available providers depend on which `*_API_KEY`s are set in `.env`.

**Q: Knowledge base not finding my document?**
1. Uploaded? Admin console → Knowledge → check entries.
2. Vector search enabled? Needs PostgreSQL + `EMBEDDING_*` (or `OLLAMA_BASE_URL`); otherwise it falls back to full-text LIKE (works, weaker).
3. Ask with knowledge-related wording.

## 5. Deployment

**Q: `docker compose up --build` slow / can't pull images?**
A: First build downloads images + compiles (~10 min). Configure a Docker registry mirror if slow. Air-gapped? Use [Offline Deploy](offline-deploy.md).

**Q: How to configure HTTPS?**
A: See [One-Click Deploy](one-click-deploy.md): `HTTPS=1 ./deploy/deploy.sh` auto-generates a self-signed cert; use a trusted cert in `certs/` for production.

**Q: No demo accounts in production?**
A: Correct — seed runs in development only. Create an admin via `npm run create:admin` after first production deploy.

**Q: Where to see CI results?**
A: Code mirrors to GitHub (`rain6fish/KeelBase`); pushing to `main` triggers GitHub Actions. Check the Actions tab. The Gitee repo is for sync only.

## 6. Platform & Permissions

**Q: Why do admin APIs return 403 for normal users?**
A: All admin endpoints require `role = admin` (CASL). This is an architecture red line (three-entry isolation). Non-admin tokens get 403.

**Q: How to promote/demote a user?**
A: Admin console → User Management → find user → change role. Users can't self-promote.

**Q: How to back up / restore data?**
A: `cd Server-Nodejs && npm run backup` (to `data/backups/`); restore: `npm run restore -- <file>`. See [Operations Manual](operations.md).

---

## 7. Still stuck?

- Open an issue with the full error + steps.
- Check backend logs: dev console, or `docker compose logs server` in production.
