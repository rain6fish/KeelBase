# KeelBase — 业务安全型 AI 应用基座

> ### 🚀 60 秒开始
> **只装 Docker，一条命令起全栈（后端+主 App+管理台）——用已发布镜像免构建：**
> ```bash
> docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
> # 访问 http://localhost:3000 主 App、/admin 管理台
> ```
> 自己构建（改代码时）：`./scripts/docker-single.sh`
> 或本地开发模式（起后端+管理台，自动开浏览器）：
> ```bash
> ./scripts/dev.sh experience
> ```
> 详见 [快速上手](docs/manual/quickstart.md) / [FAQ](docs/manual/faq.md)。

**安全地构建并运行 AI 业务应用。**

> **AI 不只是回答问题，而是在你的权限和规则内真正执行工作。**

KeelBase 是业务安全的 AI 应用基座：**让 AI 按系统约定，快速生成带安全、三端可用的企业应用**。开发期 AI 生成业务模块，10 分钟交付标准 CRUD；运行时 AI 会干活——**每个 AI 动作限定你的数据、写操作人工确认、全链路审计且可撤销**。数据不出域、AI 每步可查，专为技术团队打造的「精而深」现代化底座。

### 🎯 面向谁

同一个底座，两种用法。

**给 AI 原生开发者**——想快速构建 AI 业务应用，而不是从零搭地基：
- 从一份协议约 30 分钟生成完整业务模块（实体 / CRUD / 权限 / AI 工具 / 审计）——真实、可编辑的代码，不是低代码引擎
- 自带大模型（云端或本地），数据始终由你掌控

**给已有业务系统的团队 / 集成商**——已有 CRM / ERP / OA 或十年前的 Java 系统，想让它们拥有 AI 能力：
- 把存量系统桥接进来（OpenAPI / SQL 结构 / Java 服务），无需推翻重来
- AI 在你真实数据之上做业务助手——风险分析、跟进建议、自动总结、审批
- 私有化部署：Docker / 离线 / 本地模型——数据不出域

### 🎯 North Star

> **60 秒看懂 · 10 分钟运行 · 30 分钟创造。**

一切沿同一条主线落地——**Build → Run → Trust → Private Deploy**：

- **Build（AI Application Engineering）**：系统提供 Application Protocol（约定），AI 生成业务模块——不做低代码引擎。
- **Run（业务安全的 Agent 运行时）**：运行时 AI 真的会干活——工具调用限定数据范围、写操作人工确认、全链路审计 + 可撤销。
- **Trust / Private Deploy（数据主权）**：数据不出域，AI 每步可查、可撤销。

### 一条主线，三个验证角度

开发者验证「能否快速造出」· 用户验证「AI 是否真的有用」· 管理者验证「AI 是否安全可信」——三个角度落在同一条主线：**Build → Run → Trust → Private Deploy**。

---

## 🚀 为什么选择 KeelBase？

与传统仅关注 CRUD 的脚手架不同，KeelBase 专为 **AI 时代** 与 **企业合规** 而生。

### 🤖 AI-Native — 开发期 + 运行时双叙事

- **开发期 AI：** 对话式生成业务模块（实体/DTO/CRUD/页面/权限）+ AI 规则层（AGENTS.md）——开发者用 AI 开发，而非只聊天。
- **运行时 AI：** 深度集成 RAG、工具调用、数据洞察、长程记忆、子代理与主动服务——助手真的会干活，不只是聊天。

> **`keelbase init` 是代码生成器，不是低代码平台。**
> 它按 KeelBase 约定模板**生成真实可读代码**（实体/DTO/CRUD/页面/权限，进 git、可改、AI 可继续扩展）；LLM 负责理解需求（自然语言 → 模块规格）与后续扩展生成物。刻意不做拖拽/运行时元数据引擎（撞「不做低代码平台」定位红线）——「系统提供约定，AI 负责生成」。

### 🛡️ 业务安全的 Agent 运行时（主线）

- **数据范围限定：** 每次工具调用携带登录用户上下文，AI 只能操作该用户的数据。
- **写操作人工确认：** 写操作执行前需用户明确批准。
- **全链路审计 + 可撤销：** 每个 agent 动作留痕，AI 创建的副作用可追踪、可撤销。

### 🔒 私有化与安全性（管理者视角）

- **数据主权：** 专为私有化部署设计，数据完全掌握在自己手中，而非云厂商。
- **企业级安全：** 内置 CASL 权限控制、登录防爆破、Token 哈希、AES-256-GCM 静态加密及全链路审计日志。

### ⚡ 全栈融合

- **一端多能：** 无缝融合用户 App (Flutter)、小程序 (Taro) 和 Web 端（工作台 + 管理台同一壳）。
- **零摩擦开发：** 统一 API 契约与共享类型约定；管理功能只在控制台侧（与工作台同一壳），移动端不携带管理逻辑。

---

## 目录结构

| 目录 | 说明 |
|-----------|-------------|
| `Front-Flutter/` | 主用户 App（Flutter，iOS/Android/Web 三端） |
| `Front-Taro/` | 主 App 的 H5/小程序端（Taro） |
| `Web-Admin-Vue/` | Web 端宿主：工作台 + 管理台同一壳（Vue3 + Element Plus） |
| `Web-Admin-React/` | 管理台 React 预览版（React 19 + MUI；按实际需求转正） |
| `Server-NestJS/` | NestJS 后端（REST API） |
| `docs/` | 规格、需求、手册 |
| `.github/workflows/` | CI 流水线（lint + 测试 + 构建） |

---

## 快速上手

> 🚀 **想 5 分钟不读代码跑起来？** 看 [快速上手（零基础版）](docs/manual/quickstart.md)，排错看 [常见问题 FAQ](docs/manual/faq.md)。

### 一键体验（单容器优先）

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

### 本地开发脚本

```bash
./scripts/dev.sh experience    # 本地 Node 模式：起后端+管理台，自动验收 + 开浏览器
DOCKER=1 ./scripts/dev.sh experience   # 或纯 Docker 全量（有 make 用 `make experience`）
```

> 端口自动探测、自动验收各端、打印演示账号。

### 统一命令入口

```bash
./scripts/dev.sh help      # 全部命令（experience / dev / test / build / migrate …）
make help                 # 等价（有 make 的环境）
```

### 本地开发

```bash
./scripts/dev.sh dev        # 起后端（SQLite 零配置，自动降级缓存/队列）
./scripts/dev.sh web        # 起 Flutter Web
./scripts/dev.sh dev-admin  # 构建并托管管理台
```

#### 前置要求
- Node.js >= 22
- Flutter SDK >= 3.12
- npm

### 后端

```bash
cd Server-NestJS
cp .env.example .env
npm install
npm run start:dev
```

后端地址：http://localhost:3000  
接口文档 (Swagger)：http://localhost:3000/api/docs  
健康检查：http://localhost:3000/api/v1/health

> 开发环境数据库为零配置 SQLite（`./data/front.sqlite`）。生产环境用 `DB_TYPE=postgres` 切到 PostgreSQL。首次启动自动创建演示账号（`alex`/`admin`）。

### Flutter 前端

```bash
cd Front-Flutter
flutter pub get
flutter run            # 移动端/桌面端
flutter run -d chrome  # Web
```

前端默认对接 `http://localhost:3000/api/v1`。

### 管理台

一键部署后管理台随主 App 一起打包到 `/admin` 子路径（无需单独部署）：

- **生产/一键部署**：`http://<服务器>/admin`
- **本地**：`./scripts/dev.sh dev-admin` 启动 Vite dev server → http://localhost:10086/admin/
- 独立域名部署：`cd Web-Admin-Vue && npm ci && npm run build`，托管 `dist/`（base=/admin/）

> 管理台需 `role = admin` 账号登录，见 [演示账号](#演示账号)。

### 30 分钟生成一个模块

`keelbase init` 一条命令生成可运行的业务模块（实体 / API / 权限 / 审计 / AI 工具）：

```bash
cd Server-NestJS
node scripts/keelbase-init.mjs --module posts --label 帖子 --fields title:string,content:text
npm run build && npm test -- posts
```

模块自动接入管理台、工作台与 AI 工具（`query_posts` / `create_post` 带确认）。完整流程见 [30min-acceptance.md](docs/manual/30min-acceptance.md) · [dev-challenge.md](docs/manual/dev-challenge.md)。

### Docker 生产部署

```bash
docker compose up --build
# 生产 HTTPS：
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

启动 PostgreSQL 17 + Redis + NestJS API + Nginx（Flutter Web）。

---

## 演示账号

首次启动后端（仅开发环境）自动创建这两个账号。

| 角色 | 用户名 | 密码 | 用途 |
|------|----------|----------|------|
| 普通用户 | `alex` | `123456` | 普通用户（主 App） |
| 管理员 | `admin` | `Admin@1234` | 管理员（管理台） |

---

## 技术栈

| 层 | 技术 | 说明 |
|-------|-----------|--------------|
| 前端 | Flutter 3.x（移动主 App）· Taro 3.x Vue3（H5/小程序）· Vue3 + Element Plus（Web 端宿主：工作台 + 管理台同一壳）· React 19 + MUI（预览版） | 核心与 UI 框架无关；UI 框架作为 Renderer（见 docs/architecture-boundary.md） |
| 后端 | NestJS 11.x, TypeScript, TypeORM | 模块化、装饰器驱动 |
| 数据库 | SQLite (dev) / PostgreSQL (prod) | 开发 / 生产 |
| 缓存·队列 | Redis 7 + CacheManager (Redis) + BullMQ | 缓存层 + 异步队列 |
| 认证 | JWT access/refresh 轮换、bcrypt、登录锁定、OAuth（微信/支付宝/Google/Apple）、邮箱验证、多设备会话 | 轮换 + 防爆破 + OAuth + 多设备会话 |
| 授权 | CASL 能力权限（角色 + 行级） | 角色 + 行级权限 |
| AI | OpenAI 兼容 LLM（DeepSeek / Qwen / OpenAI）、工具调用、RAG 知识库、对话与审计持久化 | 工具调用 + RAG + 对话与审计持久化 |
| 通知 | 站内通知 + SSE 实时 + 极光推送（抽象） | 站内 + SSE 实时 + 推送抽象 |
| 邮件 | nodemailer + SMTP（验证/重置/通知模板） | 验证 / 重置 / 通知模板 |
| 存储 | 本地磁盘 / S3 兼容 (MinIO, OSS) + sharp 图片处理 (WebP) | 本地 / S3 兼容 + WebP |
| 可观测性 | pino 结构化日志、Prometheus 指标 (`/metrics`)、OpenTelemetry 链路、Loki 日志、Grafana、Jaeger | 日志 / 指标 / 追踪 |
| API | RESTful、版本化 (v1)、Swagger 文档、限流 | 版本化 + 文档 + 限流 |
| 部署 | Docker、Nginx、CI (GitHub Actions) | 容器化 + 自动化 |

---

## 功能总览

- **认证 Auth**：注册、登录、JWT 轮换、自动登录、token 刷新、OAuth 第三方登录、忘记/重置密码、邮箱验证、多设备会话管理
- **日历事件 Events**：周/月视图、日程列表、事件 CRUD（CASL 按用户所有权）
- **AI 助手**：带工具调用的对话（查事件/用户统计/页面导航）、RAG 知识库问答、数据洞察、模型热切换（DeepSeek/Qwen）、对话历史
- **通知 Notifications**：站内通知中心、未读计数、SSE 实时推送、极光设备推送（抽象）
- **管理台 Admin Console**：Vue3 + Element Plus PC Web（Web 端控制台侧）——用户管理（角色/删除）、事件管理、知识库、AI 审计日志与用量统计、操作审计、监控、模板、AI 评测、工具副作用
- **全局搜索 Search**：事件 + 公开用户统一搜索
- **文件上传 Upload**：MIME + 扩展名 + 魔数校验、10MB 上限、WebP 转换
- **安全 Security**：Helmet、CORS 白名单、Body 限制、排序注入防护、登录锁定、Token 哈希、CASL 行级权限、AES-256-GCM 静态加密
- **可观测性 Observability**：结构化 JSON 日志、Prometheus 指标、OpenTelemetry 链路追踪、Loki 日志收集、告警规则
- **运维 Ops**：备份/恢复脚本、Redis 缓存、BullMQ 异步队列

---

## 文档

| 文件 | 读者 | 用途 |
|------|----------|---------|
| [`docs/manual/quickstart.md`](docs/manual/quickstart.md) | 所有人 | 快速上手（零基础 5 分钟跑通全栈） |
| [`docs/manual/tutorial.md`](docs/manual/tutorial.md) | 所有人 | 从零到部署教程：跑起来 → 改配置 → 私有化部署 |
| [`docs/manual/faq.md`](docs/manual/faq.md) | 所有人 | 常见问题排查（环境/启动/账号/AI/部署） |
| [`docs/manual/quickstart-en.md`](docs/manual/quickstart-en.md) | Everyone | Quick Start (English) |
| [`docs/manual/faq-en.md`](docs/manual/faq-en.md) | Everyone | FAQ (English) |
| [`AGENTS.md`](AGENTS.md) | AI 代理 | 分层 AI 规则——新增业务模块必做清单 |
| [`CLAUDE.md`](CLAUDE.md) | AI 代理 | 完整架构规格、约定、安全规则 |
| [`docs/manual/usage.md`](docs/manual/usage.md) | 终端用户 | 使用手册——功能入口与常用操作（中英） |
| [`docs/manual/development.md`](docs/manual/development.md) | 开发者 | 开发手册——架构、模式、测试 |
| [`docs/manual/operations.md`](docs/manual/operations.md) | 运维 | 运维手册——部署、环境变量、迁移、可观测性 |
| [`docs/manual/plugin-development.md`](docs/manual/plugin-development.md) | 开发者 | 插件开发指南——manifest / context / lifecycle / 接线 / CLI（P1-7） |
| [`docs/manual/one-click-deploy.md`](docs/manual/one-click-deploy.md) | 运维 | 云服务器一键部署（私有化） |
| [`docs/manual/offline-deploy.md`](docs/manual/offline-deploy.md) | 运维 | 内网/离线环境部署 |
| [`docs/manual/private-ai-verification.md`](docs/manual/private-ai-verification.md) | 运维 | 私有化 AI 验证——数据留在本地的闭环（Ollama / 本地 embedding / RAG / 审计） |
| [`docs/manual/golden-demo-script.md`](docs/manual/golden-demo-script.md) | 市场 | Golden Demo 60 秒录制脚本——工具 → 权限 → 确认 → 审计闭环（P0-3） |
| [`docs/manual/aiization-demo.md`](docs/manual/aiization-demo.md) | 开发者 / 销售 | 存量系统 AI 化演示——旧 Schema → `keelbase import` → Protocol → 模块 → AI 工具 → 治理（P0-12） |
| [`docs/manual/ecosystem-pack.md`](docs/manual/ecosystem-pack.md) | 开发者 | 生态包组装——模板 / 业务技能 / 插件 CLI / 生成器（Phase 2 三方共建式构建） |
| [`docs/manual/plugin-authoring.md`](docs/manual/plugin-authoring.md) | 插件作者 | 插件编写——自包含插件模式、`keelbase-plugin verify/add/list`、PluginContext API、生命周期（Phase 2 Extension API） |
| [`docs/manual/dev-challenge.md`](docs/manual/dev-challenge.md) | 外部开发者 | 开发挑战赛——30 分钟可复现构建（模块 + AI 工具 + 确认 + 审计），含反馈表单（Phase 3） |
| [`docs/manual/release-gate.md`](docs/manual/release-gate.md) | 维护者 | 发布门禁——Build / Run / Trust / Private / External 检查清单 + 命令 + 当前状态（0.9.x 里程碑） |
| [`docs/manual/flagship-task-card.md`](docs/manual/flagship-task-card.md) | 维护者 | 旗舰 LLM 任务卡——CRM / 项目 / 审批真实业务任务 + Agent 成功率记录（Run/Private 验证） |
| [`docs/project.spec.md`](docs/project.spec.md) | 开发者 | 项目规格 |
| [`docs/protocol-ecosystem.md`](docs/protocol-ecosystem.md) | 开发者 / AI 代理 | 协议生态——Module/Flow/Tool/Plugin/Capability 协议与 AI 生成链（P1-1） |
| [`docs/ai-agent.spec.md`](docs/ai-agent.spec.md) | 开发者 | AI 助手功能规格 |
| [`docs/enterprise-capabilities.md`](docs/enterprise-capabilities.md) | 企业采购 | 企业能力声明——能力 + 证据 + 合规路径 |
| [`docs/enterprise-readiness.md`](docs/enterprise-readiness.md) | 企业采购 | 企业就绪度检查清单——状态 / 缺口 / 优先级 |
| [`docs/flagship-applications.md`](docs/flagship-applications.md) | 开发者 / 销售 | 三旗舰应用规格——AI CRM / 项目 / 审批的完整规格（数据模型、AI 工具、治理、演示路径） |
| [`SECURITY.md`](SECURITY.md) | 所有人 | 安全政策——受支持版本/漏洞报告/内置安全能力/SBOM |
| `Server-NestJS/.env.example` | 开发者 | 环境变量参考 |
