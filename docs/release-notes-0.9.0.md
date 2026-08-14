## KeelBase v0.9.0 — Business-Safe AI Agent Harness · Three-End App Base / 业务安全的 AI Agent harness · 三端应用基座

KeelBase is a full-stack app base where AI generates business modules following system conventions, with business safety built in: one backend, three ends (Flutter App + Taro mini-program + PC Web admin console); AI tool calls scoped to the user's data, human-confirmed writes, fully auditable end to end.

KeelBase 是一个「AI 按系统约定生成、业务安全」的全栈应用基座：一套后端，Flutter App + Taro 小程序 + PC Web 管理台三端出；AI Agent 工具调用限定用户数据范围，写操作人工确认，全链路可审计。

### Three Milestone Capabilities / 三个里程碑能力

- **Business-safe AI Agent harness**: AI tool calls scoped to data + human-confirmed writes + reversible side effects + eval loop + CASL row-level permissions wired into AI
  **业务安全的 AI Agent harness**：AI 工具调用限定数据范围 + 写操作人工确认 + 副作用可撤销 + 评测闭环 + CASL 行级权限与 AI 打通
- **Consistent across three ends**: Flutter App (iOS/Android/Web) + Taro mini-program/H5 + Vue3 admin console — one backend, three ends
  **三端一致**：Flutter App（iOS/Android/Web）+ Taro 小程序/H5 + Vue3 管理台，一套后端三端出
- **Production-grade engineering**: full audit trails, static encryption of sensitive data, OTel/Prometheus/Loki observability, green CI, one-click deploy + single-container delivery
  **生产级工程化**：全链路审计、敏感数据静态加密、OTel/Prometheus/Loki 可观测、CI 全绿、一键部署 + 单容器交付

### Key Features / 主要功能

- **AI**: chat (non-streaming + SSE streaming + tool-process visualization), human-confirmation protocol for writes, long-term user memory, context compaction, sub-agent delegation + skills, RAG knowledge base (document upload / vector search), web search, multimodal image understanding, AI behavior replay
  **AI**：对话（非流式 + SSE 流式 + 工具过程可视化）、写操作人工确认协议、长程用户记忆、上下文压缩、子代理委托 + 技能、RAG 知识库（文档上传/向量检索）、联网搜索、多模态图片理解、AI 行为回放
- **Three ends**: event calendar, todos, notification center (SSE + push), global search, upload, low-code forms, plugin mechanism, template market, data import/migration
  **三端**：事件日历、待办、通知中心（SSE + 推送）、全局搜索、上传、低代码表单、插件机制、模板市场、数据导入迁移
- **Security**: CASL row-level permissions, JWT rotation + login lockout, email/phone verification, AES static encryption of sensitive fields, admin-side data masking, SSRF / OAuth signature verification / auth enumeration protection
  **安全**：CASL 行级权限、JWT 轮换 + 登录锁定、邮箱/手机号验证、敏感字段 AES 静态加密、管理端数据脱敏、SSRF / OAuth 验签 / 认证枚举防护
- **Ops**: GitHub Actions CI (lint / tests / coverage / migration consistency / three-end builds), one-click deploy, offline / on-prem AI (Ollama), observability stack, ops health inspection
  **运维**：GitHub Actions CI（lint / 测试 / 覆盖率 / 迁移一致性 / 三端构建）、一键部署、离线/私有化 AI（Ollama）、可观测性栈、运维健康巡检

### Quick Start / 快速体验

```bash
docker run -p 80:80 keelbase/keelbase:0.9.0   # single-container full stack (available after image publish) / 单容器全栈（镜像发布后可用）
# or `docker compose up` for the full stack, then / 或 docker compose up 起全栈后访问：
#   User       alex / 123456
#   Admin      admin / Admin@1234（管理台 /admin）
```

### Docs & Security / 文档与安全

- [README](https://github.com/rain6fish/KeelBase) · [CHANGELOG](CHANGELOG.md) · [SECURITY.md](SECURITY.md)（漏洞披露流程 + SBOM 生成方式 / vulnerability disclosure + SBOM generation）
- Full roadmap is maintained in a private space (strategic/security details are not public) / 完整路线图维护于私有空间（战略/安全细节不公开）
