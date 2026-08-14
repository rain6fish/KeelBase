# KeelBase — Full-Stack Application Base Platform / 全栈应用基座平台

> ### 🚀 60 秒开始 / Get Started in 60s
> **只装 Docker，一条命令起全栈（后端+主 App+管理台）——用已发布镜像免构建：**
> ```bash
> docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
> # 访问 http://localhost:3000 主 App（alex/123456）、/admin 管理台（admin/Admin@1234）
> ```
> 自己构建（改代码时）：`./scripts/docker-single.sh`
> 或本地开发模式（起后端+管理台，自动开浏览器）：
> ```bash
> ./scripts/dev.sh experience
> ```
> 详见 [快速上手](docs/manual/quickstart.md) / [FAQ](docs/manual/faq.md)。

**AI-Driven Enterprise Application Base — where AI does real work, only within your authorized data.**
**AI 驱动的企业应用基座——让 AI 真的会干活，且只在你授权的数据里。**

KeelBase is a business-safe, AI-native full-stack base for building enterprise apps. Dev-time AI generates business modules from protocols in minutes; runtime AI does real work — every tool call scoped to the user's data, every write human-confirmed, every action audited. Data stays on-prem; AI stays accountable. A deep base, not a wide platform.

KeelBase 是一个业务安全的 AI 全栈应用基座：**让 AI 按照系统约定，快速生成带安全、三端可用的企业应用**。开发期 AI 生成业务模块，10 分钟交付标准 CRUD；运行时 AI 会干活——工具调用限定用户数据范围、写操作需人工确认、CASL 行级权限 + 全链路审计。数据不出域、AI 每步可查，专为技术团队打造的「精而深」现代化底座。

### 三类受益方 / Three Audiences

| | 开发者 / Developers | 终端用户 / End Users | 企业主与管理 / Owners & Admins |
|---|---|---|---|
| 核心诉求 | 30 分钟出一个带 AI 的安全应用 | AI 真的会干活，不是玩具助手 | AI 可信、数据可控、全程可审计 |
| 对应能力 | 开发期 AI（生成业务模块 + AI 规则层） | 运行时 AI（对话/工具/记忆/主动服务） | 治理内建（权限/确认/审计/撤销/私有化） |
| 一句话 | 快且不重造轮子 | 会干活且只在你的数据里干活 | 数据不出域、AI 每步可查 |

> 三个角色不是三条平行卖点，而是同一条主线的三个验证角度——开发者验证「能否快速造出」，用户验证「AI 是否真的有用」，管理者验证「AI 是否安全可信」。

---

## 🚀 Why KeelBase? (核心价值)

Unlike traditional boilerplates that focus only on CRUD, KeelBase is engineered for the **AI era** and **enterprise compliance**.

与传统仅关注 CRUD 的脚手架不同，KeelBase 专为 **AI 时代** 与 **企业合规** 而生。

### 🤖 AI-Native — 开发期 + 运行时双叙事

- **Dev-Time AI:** Dialogue-driven business-module generation (entity / DTO / CRUD / pages / permissions) plus an AI rules layer (AGENTS.md) — developers use AI to build, not just to chat.
- **Runtime AI:** Deep integration of RAG, tool calling, data insights, long-term memory, sub-agents, and proactive services — the assistant actually does work, not just chat.
- **开发期 AI：** 对话式生成业务模块（实体/DTO/CRUD/页面/权限）+ AI 规则层（AGENTS.md）——开发者用 AI 开发，而非只聊天。
- **运行时 AI：** 深度集成 RAG、工具调用、数据洞察、长程记忆、子代理与主动服务——助手真的会干活，不只是聊天。

### 🛡️ Business-Safe Agent Harness — 业务安全的 Agent 运行时（主线）

- **User-Scoped Tools:** Every tool call carries the authenticated user — AI can only touch that user's data.
- **Human Confirmation:** Write operations require explicit human approval before execution.
- **Audit & Revoke:** Full audit trails on every agent action; AI-created side effects are tracked and reversible.
- **数据范围限定：** 每次工具调用携带登录用户上下文，AI 只能操作该用户的数据。
- **写操作人工确认：** 写操作执行前需用户明确批准。
- **全链路审计 + 可撤销：** 每个 agent 动作留痕，AI 创建的副作用可追踪、可撤销。

### 🔒 Private & Secure — 私有化与安全性（管理者视角）

- **Data Sovereignty:** Designed for private deployment — you keep full ownership of your data, not a cloud provider.
- **Enterprise-Grade Security:** Built-in CASL permission control, login lockout, token hashing, AES-256-GCM static encryption, and full audit trails.
- **数据主权：** 专为私有化部署设计，数据完全掌握在自己手中，而非云厂商。
- **企业级安全：** 内置 CASL 权限控制、登录防爆破、Token 哈希、AES-256-GCM 静态加密及全链路审计日志。

### ⚡ Full-Stack Fusion — 全栈融合

- **One Base, Three Ends:** Seamlessly integrates the user App (Flutter), Mini-Program (Taro), and an isolated Admin Console.
- **Zero-Friction Dev:** Unified API contracts and shared type conventions; the admin console stays fully isolated from the main app.
- **一端多能：** 无缝融合用户 App (Flutter)、小程序 (Taro) 和独立管理台。
- **零摩擦开发：** 统一 API 契约与共享类型约定，管理台与主 App 完全隔离。

---

## Repositories / Directories / 目录结构

| Directory | Description | 说明 |
|-----------|-------------|------|
| `Front-Flutter/` | Flutter app (iOS / Android / Web) — main user app | 主用户 App（三端） |
| `Front-Taro/` | Taro H5 / mini-program app — main user app | 主 App 的 H5/小程序端 |
| `Web-Admin/` | Standalone admin console (Vue3 + Vuetify3 PC Web), fully isolated | 独立管理台（完全隔离） |
| `Server-Nodejs/` | NestJS backend (REST API) | NestJS 后端 |
| `docs/` | Specs, requirements, roadmap, manuals | 规格、需求、路线图、手册 |
| `.github/workflows/` | CI pipeline (lint + test + build) | CI 流水线 |

---

## Quick Start / 快速上手

> 🚀 **想 5 分钟不读代码跑起来？** 看 [快速上手（零基础版）](docs/manual/quickstart.md)，排错看 [常见问题 FAQ](docs/manual/faq.md)。
> 🚀 **Want to run the full stack in 5 minutes without reading code?** See [Quick Start](docs/manual/quickstart-en.md); stuck? See [FAQ](docs/manual/faq-en.md).

### Fastest Path: Single-Container / 一键体验（单容器优先）

**实测通过（2026-08-13）：一条命令起全栈，后端 API + Flutter 主 App + Vue3 管理台 + 演示账号全部就绪。**

#### 🐳 用已发布的镜像（免构建，最快）

```bash
docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
# 访问 http://localhost:3000 主 App、/admin 管理台
# 演示账号：alex/123456（主 App）、admin/Admin@1234（管理台）——首次启动自动创建
docker logs -f keelbase      # 看日志
docker stop keelbase && docker rm keelbase   # 停止并删除（数据留在命名卷 keelbase_data）
```

> 镜像托管在 [ghcr.io](https://github.com/rain6fish/KeelBase/pkgs/container/keelbase)，随 tag 自动构建发布（`latest` + 版本号）。生产建议 `-e` 覆盖 JWT/加密密钥。

#### 🛠 自己构建（改代码时）

```bash
./scripts/docker-single.sh         # 构建并启动（首次构建约 10 分钟，含前端编译）
```

| 子命令 | 说明 |
|--------|------|
| `./scripts/docker-single.sh` / `up` | 构建并启动 |
| `./scripts/docker-single.sh stop` | 停止容器 |
| `./scripts/docker-single.sh down` | 停止并删除容器 |
| `./scripts/docker-single.sh logs` | 查看日志 |

> 只需装 Docker。默认 SQLite 零配置（数据落在命名卷 `keelbase_data` 持久化），缓存/队列自动降级。**生产环境**：建议用 `docker-compose.yml` 多容器（PostgreSQL + Redis + 独立 web），或用 `-e` 覆盖密钥/DB。
> Just needs Docker. Zero-config SQLite (data persisted in `keelbase_data` volume), cache/queue auto-degrade. **Production**: prefer multi-container via `docker-compose.yml`, or override secrets/DB with `-e`.

### Alternative: Local Dev Script / 本地开发脚本

```bash
./scripts/dev.sh experience    # 本地 Node 模式：起后端+管理台，自动验收 + 开浏览器
DOCKER=1 ./scripts/dev.sh experience   # 或纯 Docker 全量（有 make 用 `make experience`）
```

> 端口自动探测、自动验收各端、打印演示账号。
> Auto port detection, auto-verify, prints demo accounts.

### 统一命令入口 / Unified Commands

```bash
./scripts/dev.sh help      # 全部命令（experience / dev / test / build / migrate …）
make help                 # 等价（有 make 的环境）
```

### Local Dev Path / 本地开发

```bash
./scripts/dev.sh dev        # 起后端（SQLite 零配置，自动降级缓存/队列）
./scripts/dev.sh web        # 起 Flutter Web
./scripts/dev.sh dev-admin  # 构建并托管管理台
```

### Local Dev Path（改代码时）

#### Prerequisites / 前置要求
- Node.js >= 22
- Flutter SDK >= 3.12
- npm

### Backend / 后端

```bash
cd Server-Nodejs
cp .env.example .env
npm install
npm run start:dev
```

Server: http://localhost:3000  
API docs (Swagger): http://localhost:3000/api/docs  
Health check: http://localhost:3000/api/v1/health

> Dev DB is zero-config SQLite (`./data/front.sqlite`). Switch to PostgreSQL for production via `DB_TYPE=postgres`. First dev start auto-creates demo accounts (`alex`/`admin`).
> 开发环境数据库为零配置 SQLite（`./data/front.sqlite`）。生产环境用 `DB_TYPE=postgres` 切到 PostgreSQL。首次启动自动创建演示账号（`alex`/`admin`）。

### Flutter Frontend / Flutter 前端

```bash
cd Front-Flutter
flutter pub get
flutter run            # mobile/desktop
flutter run -d chrome  # web
```

Frontend defaults to `http://localhost:3000/api/v1`. / 前端默认对接 `http://localhost:3000/api/v1`。

### Admin Console / 管理台

一键部署后管理台随主 App 一起打包到 `/admin` 子路径（无需单独部署）：

- **生产/一键部署**：`http://<服务器>/admin`
- **本地**：`./scripts/dev.sh dev-admin` 启动 Vite dev server → http://localhost:10086/admin/
- 独立域名部署：`cd Web-Admin && npm ci && npm run build`，托管 `dist/`（base=/admin/）

> Admin console requires an account with `role = admin`. See [Demo Account](#demo-account).
> 管理台需 `role = admin` 账号登录。

### Docker (Production) / Docker 生产部署

```bash
docker compose up --build
# production HTTPS / 生产 HTTPS：
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Starts PostgreSQL 17 + Redis + NestJS API + Nginx (Flutter web). / 启动 PostgreSQL 17 + Redis + NestJS API + Nginx（Flutter Web）。

---

## Demo Account / 演示账号

Seed data (dev only) creates both accounts automatically on first backend start. / 首次启动后端（仅开发环境）自动创建这两个账号。

| Role / 角色 | Username / 用户名 | Password / 密码 | 用途 |
|------|----------|----------|------|
| User | `alex` | `123456` | 普通用户（主 App） |
| Admin | `admin` | `Admin@1234` | 管理员（管理台） |

> 首次启动后端时自动创建（`development` 环境）。管理台需 `admin` 账号登录。

---

## Tech Stack / 技术栈

| Layer / 层 | Technology / 技术 | Notes / 说明 |
|-------|-----------|--------------|
| Frontend / 前端 | Flutter 3.x (Material 3, Provider, Dio) + Taro 3.6 (React, zustand) | 主 App 三端 + H5/小程序 |
| Backend / 后端 | NestJS 11.x, TypeScript, TypeORM | 模块化、装饰器驱动 |
| Database / 数据库 | SQLite (dev) / PostgreSQL (prod) | 开发 / 生产 |
| Cache / Queue / 缓存·队列 | Redis 7 + CacheManager (Redis) + BullMQ | 缓存层 + 异步队列 |
| Auth / 认证 | JWT access/refresh rotation, bcrypt, login lockout, OAuth (WeChat / Alipay / Google / Apple), email verification, multi-device sessions | 轮换 + 防爆破 + OAuth + 多设备会话 |
| Authorization / 授权 | CASL ability-based permissions (role + row-level) | 角色 + 行级权限 |
| AI | OpenAI-compatible LLM providers (DeepSeek / Qwen / OpenAI), tool calling, RAG knowledge base, conversation & audit persistence | 工具调用 + RAG + 对话与审计持久化 |
| Notifications / 通知 | In-app notifications + SSE realtime + JPush (abstracted) | 站内 + SSE 实时 + 推送抽象 |
| Email / 邮件 | nodemailer + SMTP (verification / reset / notification templates) | 验证 / 重置 / 通知模板 |
| Storage / 存储 | Local disk / S3-compatible (MinIO, OSS) + sharp image processing (WebP) | 本地 / S3 兼容 + WebP 处理 |
| Observability / 可观测性 | pino structured logs, Prometheus metrics (`/metrics`), OpenTelemetry traces, Loki logs, Grafana, Jaeger | 日志 / 指标 / 追踪 |
| API | RESTful, versioned (v1), Swagger documented, rate-limited | 版本化 + 文档 + 限流 |
| Deploy / 部署 | Docker, Nginx, CI (GitHub Actions) | 容器化 + 自动化 |

---

## Key Features / 功能总览

- **Auth 认证**: register, login, JWT rotation, auto-login, token refresh, OAuth third-party login, forgot/reset password, email verification, multi-device session management
- **Events 日历事件**: week/month views, agenda list, event CRUD (per-user ownership via CASL)
- **AI Assistant AI 助手**: chat with tool calling (query events / user stats / navigate pages), RAG knowledge base Q&A, data insights, model hot-switch (DeepSeek/Qwen), conversation history
- **Notifications 通知**: in-app notification center, unread count, SSE realtime push, JPush device push (abstracted)
- **Admin Console 管理台**: isolated Vue3 PC Web app — user management (roles, delete), event management, knowledge base, AI audit logs & usage stats, operation audit, monitoring, templates, AI eval, tool effects
- **Search 全局搜索**: events + public users unified search
- **Upload 文件上传**: MIME + extension + magic-byte validation, 10MB limit, WebP conversion
- **Security 安全**: Helmet, CORS whitelist, body limit, sort-injection guard, login lockout, token hashing, CASL row-level permission, AES-256-GCM static encryption
- **Observability 可观测性**: structured JSON logs, Prometheus metrics, OpenTelemetry tracing, Loki log collection, alert rules
- **Ops 运维**: backup/restore scripts, Redis cache, BullMQ async queue

---

## Documentation / 文档

| File / 文件 | Audience / 读者 | Purpose / 用途 |
|------|----------|---------|
| [`docs/manual/quickstart.md`](docs/manual/quickstart.md) | Everyone / 所有人 | 快速上手（零基础 5 分钟跑通全栈） |
| [`docs/manual/faq.md`](docs/manual/faq.md) | Everyone | 常见问题排查（环境/启动/账号/AI/部署） |
| [`docs/manual/quickstart-en.md`](docs/manual/quickstart-en.md) | Everyone | Quick Start (English) |
| [`docs/manual/faq-en.md`](docs/manual/faq-en.md) | Everyone | FAQ (English) |
| [`CLAUDE.md`](CLAUDE.md) | AI agents | Full architecture spec, conventions, security rules |
| [`docs/manual/usage.md`](docs/manual/usage.md) | End users | 使用手册 — feature URLs & common operations (EN/ZH) |
| [`docs/manual/development.md`](docs/manual/development.md) | Developers | 开发手册 — architecture, patterns, testing |
| [`docs/manual/operations.md`](docs/manual/operations.md) | Ops | 运维手册 — deploy, env vars, migration, observability |
| [`docs/manual/one-click-deploy.md`](docs/manual/one-click-deploy.md) | Ops | 云服务器一键部署（私有化） |
| [`docs/manual/offline-deploy.md`](docs/manual/offline-deploy.md) | Ops | 内网/离线环境部署 |
| [`docs/project.spec.md`](docs/project.spec.md) | Developers | Project specification |
| [`docs/ai-agent.spec.md`](docs/ai-agent.spec.md) | Developers | AI assistant feature spec |
| [`SECURITY.md`](SECURITY.md) | Everyone | 安全政策 — 受支持版本 / 漏洞报告 / 内置安全能力 / SBOM |
| `Server-Nodejs/.env.example` | Developers | Environment variables reference |
