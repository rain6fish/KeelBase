# KeelBase — 构建并安全运行业务 AI 应用

> **开源 AI 应用工程平台**——从已有系统或新业务模型，构建带治理、可审计、可私有化部署的业务安全 AI 应用。

```text
已有系统 / 新业务
        ↓
      协议 Protocol
        ↓
      AI 应用
        ↓
   业务安全 Agent
        ↓
      治理 Governance
        ↓
      审计 Audit
        ↓
    私有化部署
```

> **构建能够安全地操作业务数据的 AI 应用。**

---

## 🚀 60 秒体验

只装 Docker，一条命令起完整应用（后端 + 工作台 + 管理台 + 移动预览），免构建：

```bash
docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
```

然后按 6 步走完黄金路径：

```text
1. 打开 http://localhost:3000           （工作台）——/admin 是管理台
2. 登录——alex/123456，或 admin/Admin@1234
3. 提问：「本周哪些客户风险最高？」
4. 看 AI 分析真实业务数据
5. 批准一个跟进任务             （人工确认）
6. 打开审计轨迹                 （每个动作都可查、可撤销）
```

想要只读演示站？`./deploy/demo.sh` → http://localhost:8080。

---

## 🎯 看 AI 真正干业务

旗舰应用 **AI CRM** 不是 Demo，而是一个可工作的产品闭环：

```text
你：
「本周哪些客户风险最高？」

KeelBase AI：
3 个客户需要关注…
  → 分析客户风险
  → 读取授权的订单与跟进记录
  → 创建跟进任务
  → 请求你确认
  → 写入 CRM
  → 记录审计
  → 可撤销
```

一个真实业务场景，胜过罗列二十个功能。

---

## 🎯 面向谁

同一个底座，两种用法。

**给 AI 原生开发者**——快速构建 AI 业务应用，而不是从零搭地基：
- 从一份协议约 30 分钟生成完整业务模块（实体 / CRUD / 权限 / AI 工具 / 审计）——真实、可编辑的代码，不是低代码引擎
- 自带大模型（云端或本地），数据始终由你掌控

**给已有业务系统的团队 / 集成商**——已有 CRM / ERP / OA 或十年前的 Java 系统，想让它们拥有 AI 能力：
- 把存量系统桥接进来（OpenAPI / SQL 结构 / Java 服务），无需推翻重来
- AI 在你真实数据之上做业务助手——风险分析、跟进建议、自动总结、审批
- 私有化部署：Docker / 离线 / 本地模型——数据不出域

---

## 🔐 业务安全的设计

```text
用户请求 → AI 理解 → 业务数据 → 工具调用
        → 权限校验 → 人工确认
        → 副作用 → 审计 → 撤销
```

> **AI 可以行动——但只能在明确的业务边界内。**

- **数据范围限定**——每次工具调用携带登录用户上下文，AI 只能操作该用户的数据
- **写操作人工确认**——写操作执行前需用户明确批准
- **审计与撤销**——每个动作落在防篡改的审计哈希链上；AI 创建的副作用可追踪、可撤销
- **可解释**——「AI 为什么这么做？」由决策轨迹回答，不是黑盒

---

## 🏗 Build — AI 应用工程

从新业务模型或已有系统构建 AI 应用：

- **Application Protocol**——描述应用的人机可读 schema
- **`keelbase init`**——自然语言 / SQL 结构 / OpenAPI → 协议 → 带权限、AI 工具、确认、审计的完整业务模块
- **AI Bridge**——连接 Java/存量系统；AI 在治理约束下读写它

> 生成的产物是**普通源代码**。无专有运行时元数据。无拖拽锁定。

---

## ▶️ Run — AI 真正干业务

- 工具调用、RAG、记忆、子代理、主动 AI
- AI 读写**业务数据**——不只是聊天
- 每个工具调用限定范围、每个写操作确认、每个动作审计

---

## 🔒 Trust — 治理与审计

KeelBase 与普通 Agent 框架的区别所在：

- CASL 行级权限 · 工具治理 · 写操作确认
- 审计哈希链（防篡改）· 副作用幂等 · 撤销
- 决策轨迹 · AI 评测 · 提示词注入防御

---

## 🏠 Deploy — 私有化设计

```text
云端 LLM  或  本地模型 / Ollama
        → 本地 Embedding → 本地 RAG → 业务安全 Agent → 本地审计
```

> **当你的数据不能离开环境时，整个 AI 应用都可以本地运行。**

Docker 单容器 · 内网/离线部署 · 本地模型与 Embedding。

---

## 🛠 构建你的第一个应用

```bash
npm install -g keelbase
keelbase init --desc "Customer management"
```

自然语言 → 模块规格 → 协议 → 应用代码 → AI 工具 → 治理。

完整流程：[30 分钟验收](docs/manual/30min-acceptance.md) · [开发挑战](docs/manual/dev-challenge.md)

---

## 📦 存量系统 AI 化

```text
已有 DB / OpenAPI / Java 系统
        → Application Protocol → 生成模块
        → AI 工具 + 治理 → 业务 Agent
```

让十年前的业务系统拥有 AI 能力，而无需推翻重来。

---

## 🧩 架构

一条主线——**Build → Run → Trust → Private Deploy**：

- **Build（AI 应用工程）**：Application Protocol（约定）；AI 生成业务模块——不做低代码引擎
- **Run（业务安全 Agent 运行时）**：工具调用限定数据范围、写操作人工确认、全链路审计 + 可撤销
- **Trust / Private Deploy（数据主权）**：数据不出域，AI 每步可查、可撤销

核心与 UI 框架无关；Flutter / Vue / React 都是 Renderer（[架构边界](docs/architecture-boundary.md)）。

---

## 📚 文档

- [快速上手（5 分钟不读代码）](docs/manual/quickstart.md) · [FAQ](docs/manual/faq.md) · [从零到部署教程](docs/manual/tutorial.md)
- [运维手册](docs/manual/operations.md) · [开发手册](docs/manual/development.md) · [私有 AI 验证](docs/manual/private-ai-verification.md)
- [三旗舰应用规格（AI CRM / 项目 / 审批）](docs/flagship-applications.md) · [企业能力声明](docs/enterprise-capabilities.md)
- [CLAUDE.md](CLAUDE.md)（架构与约定）· [AGENTS.md](AGENTS.md)（AI 构建规则）· [SECURITY.md](SECURITY.md)
- **浏览全部能力 →** [docs/](docs/)

---

## 🤝 社区与贡献

- [贡献指南](CONTRIBUTING.md) · [行为准则](CODE_OF_CONDUCT.md) · **MIT** 协议
- 演示账号：`alex/123456`（工作台 / 移动端）· `admin/Admin@1234`（管理台）

## 目录结构

| 目录 | 说明 |
|-----------|-------------|
| `Server-NestJS/` | NestJS 后端（REST API） |
| `Front-Flutter/` | 主用户 App（Flutter，iOS/Android/Web） |
| `Front-Taro/` | 主 App 的 H5/小程序端（Taro） |
| `Web-Admin-Vue/` | Web 端宿主：工作台 + 管理台同一壳（Vue3 + Element Plus） |
| `Web-Admin-React/` | 管理台 React 预览版（React 19 + MUI） |
| `docs/` | 规格、需求、手册 |

## 技术栈

Flutter 3.x · Vue3 + Element Plus · React 19（预览）· NestJS 11 + TypeORM · SQLite / PostgreSQL · Redis + BullMQ · JWT + CASL · OpenAI 兼容 LLM（DeepSeek / Qwen / OpenAI）· pino + Prometheus + OpenTelemetry · Docker / Nginx · CI（GitHub Actions）
