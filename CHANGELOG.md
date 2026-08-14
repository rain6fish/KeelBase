# Changelog / 更新日志

This file records all notable changes to KeelBase. The format follows [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/), and versioning follows [Semantic Versioning](https://semver.org/lang/zh-CN/).

本文件记录 KeelBase 所有值得关注的变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.9.0] - 2026-08-13

First public release (milestone). / 首个公开版本（里程碑发布）。

### Milestones / 里程碑

- **Business-safe AI Agent harness**: AI tool calls scoped to the user's data, human confirmation for writes, reversible side effects, eval loop, CASL row-level permissions wired into AI tools
  **业务安全的 AI Agent harness**：AI 工具调用限定用户数据范围、写操作人工确认、副作用可撤销、评测闭环、CASL 行级权限与 AI 工具打通
- **Consistent across three ends**: Flutter App (iOS/Android/Web) + Taro mini-program/H5 + PC Web admin console (Vue3 + Vuetify3) — one backend, three ends
  **三端一致**：Flutter App（iOS/Android/Web）+ Taro 小程序/H5 + PC Web 管理台（Vue3 + Vuetify3），一套后端三端出
- **Production-grade engineering**: CASL permissions, full audit trails, static encryption of sensitive data, OTel/Prometheus/Loki observability, green CI, one-click deploy & single-container delivery
  **生产级工程化**：CASL 权限、全链路审计、敏感数据静态加密、OTel/Prometheus/Loki 可观测、CI 全绿、一键部署与单容器交付

### Added / 新增

**AI & Agent / AI 与 Agent**

- AI chat (non-streaming + SSE streaming), tool-call process visualization (tool_start/tool_end)
  AI 对话（非流式 + SSE 流式），工具调用过程可视化（tool_start/tool_end）
- Actionable tools + human-confirmation protocol (create_event/create_todo), side-effect preview + one-click revoke + confirmation decisions logged to audit
  可操作工具 + 人工确认协议（create_event/create_todo），副作用预览 + 一键撤销 + 确认决策落审计
- Long-term user memory, context compaction, sub-agent delegation + skills (SkillsRegistry)
  长程用户记忆、上下文压缩、子代理委托 + 技能（SkillsRegistry）
- RAG knowledge base: document upload/chunking/vector search (pgvector), retrieval debugging & chunk preview
  RAG 知识库：文档上传/切块/向量检索（pgvector），检索调试与切块预览
- web_search browsing, multimodal image understanding, image generation
  web_search 联网、多模态图片理解、图像生成
- Proactive AI services (daily digest), conversation-feedback loop, AI eval set, cost dashboard, headless API, admin AI assistant
  主动 AI 服务（每日摘要）、对话反馈闭环、AI 评测集、成本看板、headless API、管理端 AI 助手
- AI behavior replay: admin-console timeline view (tool calls / confirmation decisions / side effects / errors)
  AI 行为回放：管理台时间线视图（工具调用 / 确认决策 / 副作用 / 错误）

**Three Ends / 三端**

- Flutter main app: event calendar, todos, notification center, global search, upload, profile, Onboarding, offline cache, data visualization, first-run experience pack
  Flutter 主 App：事件日历、待办、通知中心、全局搜索、上传、个人中心、Onboarding、离线缓存、数据可视化、首次体验三件套
- Taro mini-program/H5: AI chat, todos, search, notification center, session management
  Taro 小程序/H5：AI 对话、待办、搜索、通知中心、会话管理
- PC Web admin console: users/events/knowledge/notifications/both audits/sessions/monitoring/trash/import/template market/AI eval/tool effects/platform stats
  PC Web 管理台：用户/事件/知识库/通知/两类审计/会话/监控/回收站/导入/模板市场/AI 评测/工具副作用/平台统计

**Security & Compliance / 安全与合规**

- CASL row-level permissions, JWT rotation + login lockout, email/phone verification, AES-256-GCM static encryption of sensitive fields
  CASL 行级权限、JWT 轮换 + 登录锁定、邮箱/手机号验证、敏感字段 AES-256-GCM 静态加密
- Operation audit + AI audit + confirmation-decision audit, admin-side data masking (privacy red line)
  操作审计 + AI 审计 + 确认决策审计，管理端数据脱敏（隐私红线）
- Enumeration/timing-attack protection, SSRF protection, OAuth signature verification, tightened production CORS, upload magic-byte validation
  防枚举/防时序、SSRF 防护、OAuth 验签、CORS 生产收紧、上传魔数校验

**Platform Capabilities / 平台能力**

- Low-code forms (JSON Schema dynamic rendering), plugin mechanism, template market, data import/migration
  低代码表单（JSON Schema 动态渲染）、插件机制、模板市场、数据导入迁移
- Notification center (SSE realtime + push abstraction), dynamic config center, soft-delete trash
  通知中心（SSE 实时 + 推送抽象层）、动态配置中心、软删除回收站
- Scheduled-task framework, feature flags, unified error codes + i18n
  定时任务框架、特性开关、统一错误码 + i18n

**Engineering & Ops / 工程化与运维**

- GitHub Actions CI: lint / unit / e2e / coverage thresholds / migration consistency / three-end builds
  GitHub Actions CI：lint / 单测 / e2e / 覆盖率门槛 / 迁移一致性 / 三端构建
- One-click deploy, single-container `docker run` full-stack delivery, offline/air-gapped deploy, on-prem AI (Ollama)
  一键部署、单容器 `docker run` 全栈交付、离线/内网部署、私有化 AI（Ollama）
- OTel tracing, Prometheus alerts, Loki logs, alert webhooks, ops health inspection
  OTel 链路追踪、Prometheus 告警、Loki 日志、告警 Webhook、运维健康巡检
- Data backup/restore, sqlite/postgres dual migration baselines, module manifest & dependency graph
  数据备份/恢复、sqlite/postgres 双迁移基线、模块清单与依赖图谱

### Fixed / 修复

- Initial release — no prior fix history; security/deployment hardening is tracked in git history and the DEP/CR series of the internal roadmap.
  初始版本，无历史修复记录；安全/部署硬伤治理见 git history 与项目内部 roadmap 的 DEP/CR 系列。
