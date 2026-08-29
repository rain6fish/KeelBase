# Manuals / 手册索引

Bilingual (EN/ZH) manuals for KeelBase. 中英双语手册。

| Manual / 手册 | Audience / 读者 | Purpose / 用途 |
|---------------|-----------------|----------------|
| [Quick Start / 快速上手](quickstart.md) | Everyone / 所有人 | 零基础 5 分钟跑通全栈，每步含验证与排错 / 5-min zero-setup runthrough |
| [Quick Start (EN)](quickstart-en.md) | Everyone / 所有人 | English zero-setup runthrough |
| [Tutorial / 从零到部署教程](tutorial.md) | Everyone / 所有人 | 零基础 → 跑起来 → 改配置 → 私有化部署全流程 / zero-to-deploy full journey (DX-2) |
| [FAQ / 常见问题](faq.md) | Everyone / 所有人 | 按主题排查（环境/启动/账号/AI/部署）/ topic-based troubleshooting |
| [FAQ (EN)](faq-en.md) | Everyone / 所有人 | English topic-based troubleshooting |
| [Usage Manual / 使用手册](usage.md) | End users / 终端用户 | Feature URLs & common operations / 功能 URL 与常见操作 |
| [Development Manual / 开发手册](development.md) | Developers / 开发者 | Architecture, conventions, testing, workflows / 架构、规范、测试、工作流 |
| [Operations Manual / 运维手册](operations.md) | Ops / 运维 | Deploy, env vars, backup/restore, observability / 部署、环境变量、备份恢复、可观测性 |
| [One-Click Deploy / 一键部署](one-click-deploy.md) | Ops / 运维 | 云服务器一键部署（私有化）/ cloud one-click deploy |
| [Offline Deploy / 离线部署](offline-deploy.md) | Ops / 运维 | 内网/离线环境部署 / on-prem / air-gapped deploy |
| [Admin Independent Deploy / 管理台独立部署](admin-deploy.md) | Ops / 运维 | 管理台独立域名部署 / standalone admin on its own domain (D.10) |
| [Blue-Green & Canary Deploy / 蓝绿与金丝雀部署](blue-green-deploy.md) | Ops / 运维 | 零停机发布 + 快速回滚 / zero-downtime release + instant rollback (D.3) |
| [Integrator Kit / 集成商套件](../integrator-kit.md) | 集成商 / Software vendors | 把存量系统改造成 AI 业务助手——总纲 + Java 补偿端点 + 治理部署指南 + Reference Project 实施手册 / turn legacy systems into AI assistants (roadmap §22.7) |
| [AI Bridge / AI 桥（Java 存量系统）](ai-bridge.md) | Developers / 集成商 | 外部系统接入 AI——OpenAPI 代理 + 运行时撤销 / Java legacy system to AI: proxy + runtime revoke (EB) |
| [Capability Declaration / 轻量能力声明](capability-declaration.md) | Developers / 集成商 | 一份 YAML 声明外部系统能力 → Proxy 工具（比 OpenAPI 更轻量）/ declare capabilities for AI (EB-3) |
| [External CRM Bridge Demo / 外部 CRM 接入演示](external-crm-demo.md) | Developers / Sales | 「不替换系统获得 AI 能力」演示闭环 / connect an external CRM without rewriting (EB-1) |
| [Live Demo 访问 / 在线演示指南](demo-live.md) | Sales / Everyone | 云端三入口 + Golden Flow（alex 问客户风险 → AI 分析 → 审计）/ cloud demo guide |
| [Framework Adapter / Agent 框架接入](framework-adapter.md) | Developers | 演示 Agent Framework 经 MCP 进入治理（MCP 即 Adapter）/ any agent can enter governance (AR-2) |
| [Existing System AIization / 存量系统 AI 化](aiization-demo.md) | Developers / Sales | 旧 Schema → Protocol → 模块 → AI 工具 → 治理 / legacy system to AI app (P0-12) |
| [Security Showcase / 安全验证展示](security-showcase.md) | Reviewers / 评审·验证者 | 可自行运行的安全证明路径——越权拒绝 / 工具治理 / 人工批准 / 审计哈希链 / Agent 基准 / self-service security verification tour (P1-1) |

Also see / 另见：
- [README.md](../../README.md) — project overview / 项目概览
- [CLAUDE.md](../../CLAUDE.md) — AI agent guide / AI 开发指南
- [Enterprise Readiness / 企业就绪度](../enterprise-readiness.md) — enterprise capability checklist & gaps / 企业选型能力对照与差距
