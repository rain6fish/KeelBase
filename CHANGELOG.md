# Changelog

本文件记录 KeelBase 所有值得关注的变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.9.0] - 2026-08-13

首个公开版本（里程碑发布）。

### 里程碑

- **业务安全的 AI Agent harness**：AI 工具调用限定用户数据范围、写操作人工确认、副作用可撤销、评测闭环、CASL 行级权限与 AI 工具打通
- **三端一致**：Flutter App（iOS/Android/Web）+ Taro 小程序/H5 + PC Web 管理台（Vue3 + Vuetify3），一套后端三端出
- **生产级工程化**：CASL 权限、全链路审计、敏感数据静态加密、OTel/Prometheus/Loki 可观测、CI 全绿、一键部署与单容器交付

### 新增

**AI 与 Agent**

- AI 对话（非流式 + SSE 流式），工具调用过程可视化（tool_start/tool_end）
- 可操作工具 + 人工确认协议（create_event/create_todo），副作用预览 + 一键撤销 + 确认决策落审计
- 长程用户记忆、上下文压缩、子代理委托 + 技能（SkillsRegistry）
- RAG 知识库：文档上传/切块/向量检索（pgvector），检索调试与切块预览
- web_search 联网、多模态图片理解、图像生成
- 主动 AI 服务（每日摘要）、对话反馈闭环、AI 评测集、成本看板、headless API、管理端 AI 助手
- AI 行为回放：管理台时间线视图（工具调用 / 确认决策 / 副作用 / 错误）

**三端**

- Flutter 主 App：事件日历、待办、通知中心、全局搜索、上传、个人中心、Onboarding、离线缓存、数据可视化、首次体验三件套
- Taro 小程序/H5：AI 对话、待办、搜索、通知中心、会话管理
- PC Web 管理台：用户/事件/知识库/通知/两类审计/会话/监控/回收站/导入/模板市场/AI 评测/工具副作用/平台统计

**安全与合规**

- CASL 行级权限、JWT 轮换 + 登录锁定、邮箱/手机号验证、敏感字段 AES-256-GCM 静态加密
- 操作审计 + AI 审计 + 确认决策审计，管理端数据脱敏（隐私红线）
- 防枚举/防时序、SSRF 防护、OAuth 验签、CORS 生产收紧、上传魔数校验

**平台能力**

- 低代码表单（JSON Schema 动态渲染）、插件机制、模板市场、数据导入迁移
- 通知中心（SSE 实时 + 推送抽象层）、动态配置中心、软删除回收站
- 定时任务框架、特性开关、统一错误码 + i18n

**工程化与运维**

- GitHub Actions CI：lint / 单测 / e2e / 覆盖率门槛 / 迁移一致性 / 三端构建
- 一键部署、单容器 `docker run` 全栈交付、离线/内网部署、私有化 AI（Ollama）
- OTel 链路追踪、Prometheus 告警、Loki 日志、告警 Webhook、运维健康巡检
- 数据备份/恢复、sqlite/postgres 双迁移基线、模块清单与依赖图谱

### 修复

- 初始版本，无历史修复记录；安全/部署硬伤治理见 git history 与项目内部 roadmap 的 DEP/CR 系列。
