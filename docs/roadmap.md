# 生产级提升 Roadmap

> 本文档汇总各阶段计划中**未完成**的工作，供后续按优先级执行。
> **维护规则**：每个功能计划评审/完成后，将其"不做/后续"部分追加到对应章节，并标注来源计划与日期。保持条目可执行、可验证。

更新历史：
- 2026-07-31 建立。来源：生产级差距分析 + Phase 0/1/2 计划中标记"不做"的项。
- 2026-08-04 追加「功能模块补全」章节。来源：前后端功能模块盘点分析。
- 2026-08-06 二次盘点（功能模块补全阶段收官后）：新增前端推送注册 / 通知深链 / 版本更新 / Taro 同步 4 项。
- 2026-08-06 追加「管理台深化」章节。来源：管理台功能深度优化增强规划——统一监控/审计入口 + 管理能力补全 + 管理台体验深化。
- 2026-08-06 追加「基座体验与工程化」章节（UX-1~UX-8）+ PL-4 搜索增强。来源：前端体验与工程化建议盘点。
- 2026-08-06 追加账号与合规（AU-4 SMS 手机验证 / AU-5 自助注销 / AU-6 数据导出）。来源：账号与合规需求确认。
- 2026-08-06 追加「稳定性与全球化」章节（RG-1~RG-5）。来源：稳定性/数据/配置/国际化建议盘点（限流、API 版本化、Swagger 已满足，不重复）。
- 2026-08-07 追加「AI 能力补全」AI-6~AI-10（agent 增强：长程记忆 / 可操作工具+确认协议 / 上下文压缩 / 代理化流式协议 / 子代理委托）+ 框架引入决策点。来源：AI agent 能力增强建议盘点（对照 Claude Code 自身能力）。
- 2026-08-07 追加「基座能力增强」AI-11 知识库文档接入 + D.7 一键部署交付；确定下一优先为 AI-7+AI-9 组合（可操作工具 + 过程可视化）。来源：基座能力增强建议盘点（对标 AI 可视化编排 / 知识库文档化 / 云端部署三项诉求）。
- 2026-08-07 完成 AI-6（长程用户记忆）+ AI-7（可操作工具与人工确认协议）：user_memory 表 + 规则式抽取/注入、create_event/create_todo 写工具 + SSE confirmation_request 事件 + 确认端点 + Flutter 确认卡；顺带修复流式 done 缺 conversationId。来源：本次实施。
- 2026-08-07 完成 AI-9（代理化流式协议·过程可视化）：SSE 新增 tool_start/tool_end 事件 + Flutter 工具步骤卡（running→success/error）；顺带修复前端缺 confirmation_decision case（确认卡无后续文本时不消失）。来源：本次实施。
- 2026-08-07 完成 AI-8（上下文压缩·会话摘要）：ai_conversations.summary 列 + ConversationCompactor（同步折叠式压缩，>40 条触发、留最近 12、失败全量回放）+ buildMessages 注入摘要；移除旧 50 条硬删，改 80 硬帽兜底。来源：本次实施。
- 2026-08-07 完成 AI-11（知识库文档接入）：POST /ai/knowledge/upload（admin）+ pdf-parse v2/mammoth 解析 + chunkText 切块 + ai_knowledge_chunks(postgres-only) + BullMQ knowledge 队列（QUEUE_ENABLED 降级同步）+ KnowledgeService union 向量检索 + 管理台上传按钮；后端 417 单测 + build 通过。来源：本次实施。
- 2026-08-07 完成 AI-10（子代理委托 + Skills）：SubAgentOrchestrator + 3 个只读子代理（calendar/stats/organizer）+ SkillsRegistry（week-plan 模板）+ router delegate 意图 + chatImpl 技能短路/委托分支；只读子代理，写操作留流式 AI-7 确认；后端 438 单测 + e2e 98 全绿。来源：本次实施。
- 2026-08-07 完成 AI-10.1（委托前端入口）：AiChatProvider 对技能/复杂触发词（对齐后端 Skills+delegate 关键词）、且非动作/导航请求走非流式 /ai/chat 完整回复；前端 107 测试 + analyze 干净。来源：本次实施。
- 2026-08-07 整体审视：补「平台通用能力」PL-7 定时任务框架 / PL-8 特性开关（记忆遗留的基础设施未做项）；AI-8 已完成但代码待提交（归档表「待提交」）。来源：项目现状与 roadmap 一致性审视。
- 2026-08-08 完成 PL-7（定时任务框架：@nestjs/schedule + MaintenanceTasksService 每小时过期会话/验证码/登录锁/已读通知清理 + 每日统计快照通知管理员）+ PL-8（特性开关：FeatureFlagsService + FeatureDisabledGuard 全局守卫 + @FeatureFlag，FEATURE_*_ENABLED env，覆盖 ai/search/push/sms/oauth/upload/notifications/todos）；后端 +12 单测（450 总）+ e2e 98 全绿。来源：本次实施。

---

## 功能模块补全（App 基座通用能力）

> 来源：2026-08-04 前后端功能模块盘点——以下通用模块当前缺失或仅存空壳。关注/点赞/评论、支付、多租户等具体业务能力不在基座范围，不入本清单。

### AI 能力补全

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| AI-1 | 数据洞察 API（F6） | POST /api/v1/ai/insights：InsightsService 聚合用户事件（total/active/cancelled/recent/monthlyBreakdown）+ 中文摘要；无 LLM key 也可用 | AI 模块已就绪 | **已完成** |
| AI-2 | 对话历史 API 落地 | 后端已接通：GET/DELETE `/ai/conversations` 三端点接入 ConversationService（含所有权校验）；controller 单测 + e2e 3 用例。前端历史列表页见 AI-2.1 | 无 | **已完成** |
| AI-2.1 | 对话历史前端列表页 | 后端加 GET /ai/conversations/:id（单对话加载）；前端 ConversationProvider + /ai/history 列表页（预览/切换/删除）+ AiChatProvider.loadConversation + AI 聊天页入口 | AI-2 已就绪 | **已完成** |
| AI-3 | RAG 能力接入 | RagAgent 已定义未接线（router/reflection/planExecute 三 agent 已接入 ai.service）；接入后支持基于知识库/文档问答 | AI 模块已就绪 | **已完成** |
| AI-4 | 模型热切换 UI（F12） | spec 规划前端可切换 DeepSeek/Qwen；后端已支持 provider/model 参数，前端未暴露入口 | 无 | **已完成** |
| AI-5 | RAG 向量检索升级 | EmbeddingsService（OpenAI 兼容 /embeddings，零依赖）+ pgvector 迁移（postgres 建表/HNSW，sqlite no-op）+ KnowledgeService 降级链（向量优先，失败/无配置降级全文，签名不变 RagAgent 零改动）+ VECTOR_SEARCH_ENABLED 开关 + 写入向量化/删除清理；后端 +16 单测，e2e 全绿（sqlite 走全文） | PostgreSQL + pgvector 已就绪（2026-08-05） | **已完成** |
| AI-6 | 长程用户记忆 | user_memory 表：对话中抽取用户事实（偏好/称呼/常用事件类型等），回复前注入记忆上下文，支持检索/过期清理；解决跨会话零记忆（对齐参考：Claude Code 的 auto-memory） | AI 模块已就绪 | **已完成** |
| AI-7 | 可操作工具 + 人工确认协议 | 现有 5 个工具全为只读查询；补写工具（创建事件/待办/提醒）+ 人工确认：SSE 增加 confirm_required 事件，前端确认卡，用户确认后才执行写操作（低风险直接做、高风险先确认） | AI 模块 + 流式已就绪 | **已完成** |
| AI-8 | 上下文压缩（会话摘要） | 单会话消息超阈值后自动生成摘要，保留「摘要 + 最近窗口」，防长对话超窗口；顺带解决 buildMessages 全量回放的历史开销 | AI-2 已就绪 | **已完成** |
| AI-9 | 代理化流式协议 | SSE 增加 tool_start / tool_end / step 事件，前端渲染"正在查询/调用工具"过程卡片，让 agent 行为可见（对齐参考：Claude Code 工具调用可视化） | AI 模块 + 流式已就绪 | **已完成** |
| AI-10 | 子代理委托 + Skills | 单链改可委托：专用子代理各自配提示词 + 受限工具集，结果汇总；加可复用任务模板（如"帮我安排本周"=读日历→查冲突→建议→创建）；重架构，二期 | AI-6~AI-9 落地后 | **已完成** |
| AI-10.1 | 委托前端入口 | 委托只在非流式 chatImpl，前端主走流式则功能休眠。AiChatProvider 对技能/复杂触发词（对齐后端 Skills+delegate 关键词）、且非动作/导航请求走非流式 /ai/chat 完整回复 | AI-10 已就绪 | **已完成** |
| AI-11 | 知识库文档接入 | 知识条目现为纯文本（title+content），缺企业文档链：上传 PDF/Word（复用 upload 模块）→ 解析（pdf-parse/docx）→ 切块（chunking）→ 向量化（复用 EmbeddingsService/AI-5）→ 入库 + 删除清理；切块/向量化走 BullMQ 异步（3.2）避免阻塞 HTTP | AI-5 / 3.2 已就绪 | **已完成** |

> **框架引入决策点**：保持零框架（现有 LlmProvider 接口 / ToolRegistry / router·plan-execute·reflection agent 循环即 LangChain 的等价物，provider 均为 OpenAI 兼容）。当写工具数量 > 15 或需要多 agent 动态编排时，再评估 **Vercel AI SDK v5 Core**（薄、TypeScript 原生）；不引入 LangChain.js / LlamaIndex。

### 账号与认证

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| AU-1 | 忘记密码 / 密码重置 | 后端 forgot-password + reset-password 流程（邮件发送重置链接）+ 前端页面；当前仅有注册/登录，无找回入口 | PL-1 | **已完成** |
| AU-2 | 邮箱/手机验证 | 注册时验证邮箱/手机（验证码或链接），未验证账号限制部分功能 | PL-1（邮箱）/SMS 服务 | **已完成（含未验证写操作限制）** |
| AU-3 | 多设备会话管理 | 查看已登录设备列表、远程登出；当前 refresh token 轮换仅支持当前会话 | JWT 轮换已就绪 | **已完成** |
| AU-4 | SMS 手机号验证 | SmsModule（SMS_DRIVER=console/aliyun 预留 + 降级）+ send-sms-code/bind-phone/login-phone 三端点（防枚举+限频，验证码 SHA-256）+ User 加 phone_hash/phone_verified + PhoneVerificationCode 表 + 迁移；前端登录页手机号 tab + 绑定手机页 + i18n；后端 8 单测 + 6 e2e + 前端 9 测试 | 无 | **已完成** |
| AU-5 | 用户自助注销 | POST /auth/deactivate（密码确认 + 级联清理 + 防删最后 admin + 清会话）；前端 profile 注销入口（密码弹窗） | AU-3 | **已完成** |
| AU-6 | 数据导出 | GET /auth/export-data（本人全量 JSON：profile/events/todos/对话/通知）；前端 profile 导出入口 | 无 | **已完成** |

### 消息与实时通信

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| MS-1 | 站内通知中心 | 后端 Notification 实体 + 5 API（列表/未读数/已读/全部已读/删除）+ NotificationsService.create()；前端 notifications feature（消息页 + provider + Explore 入口）；通知迁移；后端 10 单测 + e2e 5 用例 + 前端 5 测试 | 无 | **已完成** |
| MS-2 | 推送通知 | FCM/APNs/厂商推送集成，事件提醒、消息实时触达 | MS-1 | **已完成（抽象层：PushService 接口 + 极光 + noop 降级；FCM/APNs 实现待凭据）** |
| MS-3 | 通知实时通道（SSE） | 用 SSE 替代 socket.io（单向推送等价、复用现有 SseClient）：NotificationsGateway + POST /notifications/stream + create 后实时推送 + 前端订阅；后端 4 gateway 单测 + 前端 2 订阅测试 | MS-1 | **已完成** |
| MS-2.1 | 推送触发接线 | device token 注册表（用户设备 → token）+ `NotificationsService.create()` 触发 PushService | MS-2 已就绪 | **已完成** |
| MS-2.2 | FCM/APNs 推送实现 | 凭据到位后补 FcmService/ApnsService（PushService 接口已覆盖） | 外部凭据 | 待办 |
| MS-2.3 | 前端设备推送注册 | 后端 MS-2.1 的 push_tokens 注册表 + POST/DELETE /push/tokens 已就绪，但 Flutter 前端无任何 token 上报逻辑（grep 无匹配）——推送链路缺消费端；需原生集成（firebase_messaging 或极光 SDK）获取设备 token → 登录后上报、登出注销；补本地通知 flutter_local_notifications 前台展示 | MS-2/MS-2.1 已就绪 + 外部凭据 | 待办 |
| MS-4 | 事件提醒定时推送 | 事件设置提醒（reminderMinutes），BullMQ delayed job 到点建通知 + 推送 | MS-2/3.2 | **已完成** |
| MS-5 | 通知深链跳转 | 通知实体加 targetType/targetId 结构化字段 + 迁移 + create/SSE/推送透传；前端通知点击按类型跳转业务页（事件编辑页/对话历史/待办 tab），无 target 仅标记已读；后端 3 spec + 前端 model 3 测试 | MS-1 | **已完成** |
| ST-1.1 | 前端头像消费 | profile 编辑页上传头像 + profile 页展示（闭环 ST-1/ST-2） | ST-1/ST-2 | **已完成** |

### 存储与文件

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| ST-1 | 对象存储抽象 | 上传从本地磁盘（multer diskStorage）抽象为可切换存储后端（本地/S3/OSS/MinIO） | 无 | **已完成** |
| ST-2 | 图片处理 | 头像/事件图片缩略图、尺寸压缩、WebP 转换 | ST-1 | **已完成** |

### 平台通用能力

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| PL-1 | 邮件服务集成 | nodemailer/SMTP 封装 + 事务邮件模板（注册验证/重置密码/通知） | 无 | **已完成** |
| PL-2 | 通用操作审计 | 除 AI 审计外，记录用户增删改查操作（who/when/what），便于合规追溯 | 无 | **已完成** |
| PL-3 | 数据备份与恢复 | 定期数据库备份 + 恢复演练 | 生产部署 | **已完成** |
| PL-4 | 全局搜索 | 跨模块（events/users 等）统一搜索入口 | 无 | **已完成** |
| PL-4.1 | 搜索体验增强 | PL-4 已实现搜索框 + 事件/用户双 Tab + Dashboard 入口；补：搜索历史与热词（聚焦展示）、AI 对话历史/知识库 Tab、入口上移 AppShell 顶部 | PL-4 已就绪 | 待办 |
| PL-5 | 应用版本更新检查 | GET /api/v1/app/version 元数据端点 + 前端启动检查（强制更新阻断/引导更新）+ settings 版本展示与手动检查 + url_launcher 跳转 + 版本对比工具；后端 2 单测 + e2e 1 + 前端 11 测试 | 无 | **已完成** |
| PL-6 | Front-Taro 端功能同步 | Taro 端新增通知中心（列表/未读/已读/全部已读/删除）+ 会话管理（设备列表/当前设备/远程登出）；api-client 补 PATCH + 统一 x-device-id 头；profile/settings 入口；AI/搜索/待办按渠道策略留 Flutter | 各模块已就绪 | **已完成** |
| SAM-1 | 待办清单（基座验证样例） | 真实业务走一遍基座前后端流程：后端 todos CRUD + CASL + 迁移；前端第五 tab + provider + 页面；同轮补 upload 图片预览 / dashboard 头像 / explore 入口 | 基座已就绪 | **已完成** |
| PL-7 | 定时任务框架 | 引入 @nestjs/schedule cron：每日统计快照、过期会话/验证码清理、日志与通知轮转、邮件重试等周期任务（区别于 3.2 BullMQ 的延迟任务） | 无 | **已完成** |
| PL-8 | 特性开关（Feature Flags） | 配置化开关：AI 功能/搜索/推送等按环境或全局开合（如 ai.enabled、search.enabled）；与 RG-2 动态配置中心互补（PL-8 管功能开关，RG-2 管运营参数值） | 无 | **已完成** |

---

## Phase 3 — 性能与扩展性

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| 3.1 | Redis 缓存层 | 高频读取数据（用户信息、配置、事件列表）加缓存；需考虑失效策略与穿透防护 | 引入 Redis | **已完成** |
| 3.2 | 异步任务队列（Bull + Redis） | 耗时操作异步化：AI 耗时推理、通知发送、报表生成，避免阻塞 HTTP 线程 | 引入 Redis | **已完成（推送队列；AI/insights 标注后续）** |
| 3.3 | 数据库读写分离 / 分库分表 | 数据量与读请求增长后的扩展策略；生产用 PostgreSQL 时评估 | 生产部署 PostgreSQL | 待办 |

> 来源：生产级差距分析「可扩展性与性能」；Phase 0 讨论中明确"等真有并发压力时做也来得及"。

---

## 安全强化

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| S.1 | 数据级权限（CASL） | 已引入 @casl/ability，CaslAbilityFactory + PoliciesGuard + @CheckPolicies/@CurrentAbility；users/events 所有权校验已迁移 | 无 | **已完成** |
| S.1.1 | AiConversation 所有权迁移到 CASL | conversation.service 的 2 处 `conv.userId !== userId` 校验未迁移：userId 是 UUID 字符串而 JWT sub 是数字，校验在 AiService 内部流转，迁移需处理字符串转换 | 无 | **已完成** |
| S.2 | 敏感数据静态加密 | phone / providerId 已用 AES-256-GCM 加密存储（EncryptionService）；providerId 用 HMAC-SHA256 派生 providerHash 供查询；密钥 ENCRYPTION_KEY | 无 | **已完成** |
| S.3 | XSS / SQL 注入防护审计 | 现有 class-validator + TypeORM 参数化查询为基础，需定期安全审计 | 无 | **已完成**（审计结论：前端无 HTML 渲染面/React-Taro-Flutter 默认转义，后端原生 SQL 全参数化、sort 白名单；补 3 个安全回归 e2e：SQL 注入 payload 字面量处理 / sort 注入回退 / 多余字段被 whitelist 拒绝） |
| S.4 | 管理员端功能 | 后端 Admin API 已完成：用户管理（PATCH /users/:id/role、删除守卫）、事件管理（GET /events/admin/all、DELETE /events/admin/:id）、审计监控（GET /audit/logs、GET /audit/stats） | S.1 已就绪 | **已完成** |
| S.4.1 | 管理员前端页面 | 独立 Taro H5 管理台（Front-Taro-Admin）：登录 + 概览 + 用户/事件/审计管理，与主 app 完全隔离；`build:h5` 产物可独立部署 | S.4 已就绪 | **已完成** |

> 来源：生产级差距分析「安全性」。

---

## 管理台深化（Front-Taro-Admin 增强）

> 来源：2026-08-06 管理台功能深度优化增强规划。原则：**所有管理功能（含监控审计）的页面入口统一从管理台进入**；优先复用已就绪的后端能力（S.4 / PL-2 / AI-3 / AI-5 / AU-3 / MS-1 / PL-5），新增能力以最小后端端点补充。

### 一、统一入口（监控 / 审计从管理页进入）

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| AD-1 | 操作审计接入管理台 | 后端 GET /audit/operations/logs + /stats（PL-2）已就绪但管理台未接入；新增「操作审计」页：写操作日志列表（who/when/what/IP）+ 按 action/userId/时间过滤 + 按 action 分组统计 | PL-2 已就绪 | **已完成** |
| AD-2 | 内置监控中心（运行状态页） | 新增后端聚合端点 GET /admin/monitor/summary：health + 数据库/Redis/队列/存储依赖状态 + Prometheus 关键指标（请求速率/错误率/延迟/并发）+ 告警状态；管理台「监控中心」页卡片展示，作监控第一入口（不依赖外部 Grafana） | O.3 告警 + 指标已就绪 | **已完成** |
| AD-3 | 可观测性系统入口 | 管理台「运维」区提供 Grafana / Prometheus / Jaeger / Loki 外链或 iframe 入口，URL 配置化（OBSERVABILITY_BASE_URL），从管理页内统一跳转 | D.1 可观测性栈 | **已完成** |

### 二、管理能力补全（复用已就绪后端）

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| AD-4 | 知识库管理页面 | 后端 /ai/knowledge CRUD（AI-3/AI-5）已就绪但管理台未接入；新增「知识库」页：条目列表/搜索 + 创建/编辑/删除（RAG 内容管理） | AI-3 / AI-5 已就绪 | **已完成** |
| AD-5 | 创建用户 | 后端 POST /users（管理员）已就绪；用户管理页新增「新建用户」表单（username/email/password/role） | S.4 已就绪 | **已完成** |
| AD-6 | 用户详情页深化 | 用户列表行点击进入详情：基本信息 + 设备会话列表（可强制下线）+ 通知记录 + 按用户过滤的操作审计 + AI 用量 | AU-3 / MS-1 / PL-2 / AI 审计已就绪 | **已完成**（GET /admin/users/:id/detail 聚合端点 + 详情页） |
| AD-7 | 通知广播 | 后端新增管理员发送端点（复用 NotificationsService.create：全体/指定用户/多用户）+ 管理台「通知」页（发送 + 历史列表） | MS-1 已就绪 | **已完成** |
| AD-8 | 会话管理（管理员视角） | 查看全部用户在线会话 + 强制下线任意会话；后端补管理员视角端点（复用 user_sessions 表 + 会话清除逻辑） | AU-3 已就绪 | **已完成** |

### 三、管理台自身体验深化

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| AD-9 | 多级导航升级 | 4 tab 平铺 → 分组二级导航（数据管理 / 监控审计 / 系统），承载新增功能 | AD-1~AD-8 落地后 | **已完成** |
| AD-10 | 审计详情展开 | AI 审计 + 操作审计行点击展开：payload 摘要 / 耗时 / 状态 / 前后差异 | PL-2 / AI 审计 | **已完成**（两类审计行点击展开） |
| AD-11 | 列表数据导出 | 用户/事件/两类审计列表导出 CSV（前端生成，无后端依赖） | 无 | **已完成**（事件/操作审计/AI 审计导出） |
| AD-12 | 时间范围筛选统一 | 审计/监控/事件统一时间范围筛选组件 + 快捷区间（今天/7 天/30 天） | 无 | **已完成**（RangeFilter 组件，审计+事件接入） |
| AD-13 | 概览页升级为平台总览 | 当前概览仅 AI 用量；升级为平台数据总览：用户/事件/待办/通知/存储用量/操作审计数 + 近 7/30 天趋势 | AD-2 聚合端点 | **已完成** |
| AD-14 | 事件管理深化 | 事件列表支持按用户/状态/时间范围过滤 + 标题搜索；行点击查看详情（含所属用户信息） | S.4 已就绪 | **已完成**（后端 admin/all 支持 keyword/userId/isCancelled/start/end + 前端筛选） |
| AD-15 | 版本与环境信息 | 「系统」页展示 /app/version（PL-5）+ 环境配置只读摘要（脱敏，不含密钥） | PL-5 已就绪 | **已完成** |

---

## 基座体验与工程化（前端补全）

> 来源：2026-08-06 前端体验与工程化建议盘点——离线、调试、合规、可视化等基座通用能力。

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| UX-1 | 离线缓存与乐观更新 | 引入本地数据库（Hive/Isar/sqflite）缓存 events/todos/notifications；「缓存优先，网络更新」策略，离线可读列表/详情；列表删除/完成待办乐观更新 UI，请求失败回滚 | 无 | 待办 |
| UX-2 | 开发调试菜单（Dev Menu） | Debug 模式摇一摇/长按头像弹出：环境切换（Dev/Stage/Prod）、假数据生成（100 条事件/用户）、权限模拟（未登录/普通/管理员）、清缓存（SharedPreferences + 本地库） | 无 | 待办 |
| UX-3 | 代码生成器 | Flutter 模块脚手架脚本：输入模块名自动生成 features/\<name\>/{data,domain,presentation} + Provider/Model 模板 | 无 | 待办 |
| UX-4 | 应用锁（App Lock） | local_auth 生物识别；设置开启「启动时验证 FaceID/指纹」，保护隐私数据 | 无 | 待办 |
| UX-5 | 仪表盘数据可视化 | fl_chart 集成：本周完成待办数 / AI 对话次数趋势等图表（复用 /ai/insights 数据） | SAM-1 / AI-1 已就绪 | 待办 |
| UX-6 | 公告 App 端消费 | AD-7 管理台广播的前端半段：启动拉取最新公告弹窗展示 + 入口红点 | AD-7 已就绪 | 待办 |
| UX-7 | 隐私合规延迟初始化 | 用户同意隐私政策前不初始化第三方 SDK（统计/推送）；legal 模块配合延迟初始化；接 MS-2.3 推送 SDK 时前置 | MS-2.3 | 待办 |
| UX-8 | Onboarding 首次引导 | 首次启动功能介绍页（可跳过）；业务相关性强、基座通用价值低，低优先 | 无 | 待办（低优先） |

---

## 稳定性与全球化（后端/平台进阶）

> 来源：2026-08-06 稳定性与数据配置建议盘点。已满足不重复：限流（ThrottlerModule 全局 + 端点级）、API 版本化（enableVersioning URI + defaultVersion v1）、Swagger（dev 文档 + Authorize）。

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| RG-1 | 外部依赖熔断 | AI/邮件/短信/推送等外部依赖连续失败 N 次后快速失败熔断（opossum 或自定义状态机，NestJS 无内置），防级联拖垮服务；与 3.2 队列、O.3 告警互补 | AI/PL-1/推送已就绪 | **已完成（CircuitBreakerService 状态机 + mail/sms/push 接入；AI provider 调用点分散，接入列为 RG-1.1 细化）** |
| RG-2 | 动态配置中心 | Settings 表 + 管理台实时修改立即生效：维护模式开关 / AI 每日调用上限 / 新用户赠送积分等运营参数，替代改 .env 需重启 | AD-15 已就绪（当前仅只读摘要） | **已完成（Settings 表 + GET/PUT /settings + MaintenanceGuard 维护模式 503 + AI_DAILY_LIMIT 读接口；AI 每日限额实际校验待 ai.service 接入）** |
| RG-3 | 软删除与回收站 | 核心实体（users/events/todos/notifications）启用 @DeleteDateColumn() + 查询自动过滤；管理台「回收站」视图恢复误删数据 | S.4 / AD 已就绪 | 待办 |
| RG-4 | 异常告警 Webhook | 500/致命异常主动推送钉钉/飞书/Slack 群（Webhook URL 配置化），O.3 告警规则 + Loki 日志之外的人工主动触达 | O.3 已就绪 | 待办 |
| RG-5 | 后端统一错误码 + i18n | 业务错误码机制（USER_NOT_FOUND 等，现 code 仅 HTTP 状态码）+ 前端按错误码渲染文案；响应按 Accept-Language 返回对应语言错误描述 | 前端 i18n 已就绪 | **已完成（BusinessException + API_ERROR_CODES 映射 + filter 按 Accept-Language 本地化 + errorCode 透传；auth/users/email-guard 关键路径已迁移，code 保持 HTTP 状态码向后兼容；前端按 errorCode 渲染待后续）** |

---

## 可观测性深化

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| O.1 | OTel 深度插桩 | 当前仅 auto-instrumentation 覆盖 HTTP/Express 层；补 NestJS core 层、数据库层、业务自定义 span | Phase 2 已就绪 | **已完成**（业务 span 工具 tracer.ts：ai.chat/chatStream/insights/notification.create/image.process/knowledge.search；TypeORM 查询 logger 生成 db.query span 覆盖 better-sqlite3；Jaeger 实测完整链路 HTTP→Controller→业务→db.query 28 span） |
| O.2 | 集中日志收集（Loki） | pino-loki 直推日志到 Loki，Grafana 已含 Loki 数据源；`LOKI_ENABLED=true` 启用 | Phase 2 已就绪 | **已完成** |
| O.3 | Prometheus 告警 + Grafana 面板 | 4 条告警规则（ServerDown/高错误率/高延迟/高并发），已验证触发与恢复；Grafana `manageAlerts` 展示 | Phase 2 已就绪 | **已完成** |
| O.4 | Jaeger / OTLP 后端 | Jaeger 已编排并收到 server traces（D.1 已含） | Phase 2 已就绪 | **已完成** |

> 来源：Phase 2 计划「不做」章节。

---

## 运维与部署

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| D.1 | 可观测性栈 docker-compose 编排 | `docker-compose.observability.yml`：Prometheus + Grafana（预置 dashboard）+ Jaeger，本地一键起全套；已验证 Prometheus 抓取 / Grafana 面板 / Jaeger 收到完整 HTTP traces | O.2/O.3/O.4 | **已完成** |
| D.2 | Kubernetes 容器编排 | 自动伸缩、滚动更新、故障恢复；当前仅 docker-compose | 生产规模增长后 | 待办 |
| D.3 | 蓝绿 / 金丝雀部署策略 | 生产部署流程完善 | 无 | 待办 |
| D.4 | 数据库迁移 CI 校验 | 生成首个统一基线迁移（1785-InitialSchema，全表）；CI 新增 migration-consistency job：migration:run 建库后 migration:generate 对比，实体与迁移一致则通过，有未迁移变更则失败 | 无 | **已完成** |
| D.5 | CI 落地 | 最终采用 **GitHub Actions 方案**：仓库镜像到 GitHub（rain6fish/app-dev-base，main 分支），`.github/workflows/ci.yml` 真实运行并全绿（lint / 单元 155 / E2E 40 / build / flutter-analyze）。**Gitee Go 方案放弃**（Gitee Go 免费版 node 版本过老、网页端配置受限，且 Gitee 不支持 GitHub Actions）。双远程（GitHub + Gitee）代码同步，push 到 GitHub main 自动触发 CI | 无 | **已完成** |
| D.7 | 一键部署交付（私有化定位） | deploy/ 目录：deploy.sh（装 Docker → 起 Compose → 配 HTTPS → 建 admin 账号）+ 云厂商轻量服务器（阿里云/腾讯云）部署指南；「数据主权/私有化部署」定位的最后一公里交付物 | 生产 compose 已就绪 | 待办 |

> 来源：生产级差距分析「可观测性与运维」；Phase 2 计划「不做」章节。

---

## 测试与质量

| # | 条目 | 说明 | 依赖 | 状态 |
|---|------|------|------|------|
| T.1 | 前端 Flutter 测试覆盖 | AuthProvider（10 用例）+ EventsProvider（12 用例）+ login_page widget（2 用例），共 25 测试通过；mocktail 已加；CI flutter job 加 `flutter test` | 无 | **已完成** |
| T.2 | 测试覆盖率门槛 | jest.config.ts 加 coverageThreshold（statements 40 / branches 30 / functions 40 / lines 41）；CI test job 改跑 `test:cov` | 无 | **已完成** |
| T.3 | CI flutter-analyze job 验证 | GitHub Actions 已验证 flutter-analyze job 真实跑通（flutter pub get + flutter analyze 均 success） | 无 | **已完成** |

> 来源：生产级差距分析「代码质量与测试」；Phase 0 计划「不做」章节。

---

## 已完成（归档）

| 阶段 | 内容 | 提交 |
|------|------|------|
| Phase 0 | CI 流水线 + 核心模块单元/E2E 测试 + ESLint 配置 | 6b0a312 |
| Phase 1 | RBAC 授权层（UserRole + RolesGuard + admin 端点）+ auth 安全修复（jti / null 清除） | 6b0a312 |
| — | AI 模块编译/DI/测试修复 | 6b0a312 |
| Phase 2 | 结构化日志（pino）+ Prometheus 指标 + OpenTelemetry 追踪 + @Raw() | 52b3efe |
| S.1 | CASL 数据级权限（CaslAbilityFactory + PoliciesGuard + users/events 迁移） | b0bd61a |
| S.4 | 管理员端功能（用户/事件管理 + 审计监控后端 API） | 86885ab |
| S.4.1 | 独立管理员管理台 Front-Taro-Admin（Taro H5，全量模块） | 24a4400 |
| D.1 | 可观测性栈编排（Prometheus + Grafana + Jaeger）+ OTel 修复 | 94ca6a4 |
| O.2 | Loki 集中日志收集（pino-loki 直推）+ O.4 Jaeger 落地 | ce704d2 |
| O.3 | Prometheus 告警规则（ServerDown/错误率/延迟/并发） | de31df3 |
| D.5 | CI 落地 — 镜像到 GitHub 跑 GitHub Actions（全绿），放弃 Gitee Go | 275bafe..7432cc1 |
| S.2 | 敏感数据静态加密（phone/providerId AES-256-GCM + providerHash） | b4cb8b6 |
| T.2 | 覆盖率门槛（jest coverageThreshold） | 3dbda20 |
| D.4 | 基线迁移 + CI 迁移一致性校验 | 3dbda20 |
| T.1 | Flutter 测试覆盖（Provider + widget，25 测试） | 243b621 |
| MS-1 | 站内通知中心（后端 + 前端消息页） | 3d00857 |
| MS-3 | 通知实时推送（SSE 通道） | 39893f6 |
| AI-2 | 对话历史 API 后端接通 | 324255d |
| AI-2.1 | 对话历史前端列表页（+ 单对话加载端点） | 364acee |
| AI-1 | 数据洞察 API（事件统计聚合 + 摘要） | d613f39 |
| AI-3 | RAG 知识库问答（knowledge 意图 + 全文检索 + admin CRUD） | 42bd4ee |
| AI-4 | 模型热切换 UI（导航栏切换 DeepSeek/Qwen，透传 provider） | 7889182 |
| PL-1 | 邮件服务集成（nodemailer/SMTP 封装 + 三模板，降级模式） | ce6b0fb |
| AU-1 | 忘记密码/密码重置（forgot/reset API + 防枚举 + 前端两页） | 028a895 |
| AU-3 | 多设备会话管理（user_sessions 表 + 设备列表 + 远程登出） | ccb2d83 |
| AU-2 | 邮箱验证（注册发码 + verify/resend API + 前端验证码页） | c72141a |
| PL-4 | 全局搜索（events 本人 + users 公开字段，Dashboard 入口） | c543d3f |
| PL-2 | 通用操作审计（全局拦截器 + admin 查询端点） | 2630c56 |
| ST-1 | 对象存储抽象（StorageService local/s3 工厂 + memoryStorage） | 2aa618c |
| ST-2 | 图片处理（sharp 转 WebP + 尺寸上限，save 前处理） | 830c5a1 |
| PL-3 | 数据备份与恢复（backup/restore 脚本 + 轮转 + 0600） | cde38ab |
| MS-2 | 推送抽象层（PushService 接口 + 极光 + noop 降级） | 5141b2a |
| MS-2.1 | 推送触发接线（push_tokens 注册表 + create() 触发） | ac57653 |
| ST-1.1 | 前端头像消费（profile 上传 + 展示，resolveUrl） | 9e71d6d |
| 3.1 | Redis 缓存层（CacheService + users/events/oauth 缓存 + 可降级） | 50d23f1 |
| 3.2 | BullMQ 异步队列（推送队列化 + worker 分离 + 可降级） | cd8280c |
| MS-4 | 事件提醒定时推送（reminderMinutes + delayed job） | fa646af |
| AU-2.1 | 未验证邮箱写操作限制（EmailVerificationGuard） | 8c17c0d |
| S.1.1 | AiConversation 所有权迁移到 CASL | c16ac7f |
| SAM-1 | 待办清单（todos CRUD + CASL + 第五 tab + upload 预览 / dashboard 头像 / AI 导航 + 需求/规格文档） | 2c3a641 |
| MS-5 | 通知深链跳转（targetType/targetId + 前端按类型跳转 + SSE/推送透传） | 07ea171 |
| PL-5 | 应用版本更新检查（/app/version 端点 + 启动检查 + 引导/强制更新弹窗） | e295992 |
| PL-6 | Front-Taro 功能同步（通知中心 + 会话管理 + PATCH/x-device-id 支持） | 8fed27d |
| AI-5 | RAG 向量检索升级（EmbeddingsService + pgvector 迁移 + 降级链） | 6a2ad95 |
| 管理台深化 | AD-1/2/3/4/5/7/8/9/13/15：Admin 聚合模块（monitor/overview/sessions/broadcast）+ 操作审计/监控中心/可观测性/知识库/通知广播/会话管理/系统信息/新建用户/平台总览 + 多级导航 + e2e 6 用例 | 1cc383b |
| 管理台余项 | AD-6/10/11/12/14：用户详情聚合端点 + 详情页、AI 审计行展开、CSV 导出、RangeFilter 时间筛选、事件 admin/all 过滤（keyword/userId/isCancelled/start/end）+ 邮箱掩码只掩前缀保留域名；e2e 89 全绿 | da40a23 |
| O.1 + S.3 | OTel 深度插桩（业务 span 工具 + TypeORM db.query span + Jaeger 实测）；XSS/SQL 注入安全审计 + 3 个安全回归 e2e；e2e 92 全绿、单测 322 | 409606d |
| D.6 | PostgreSQL 生产迁移链（独立 postgres 基线 + 按驱动过滤加载 + 实体 type:Date 跨库兼容；postgres 空库/生产 dist 路径验证全通） | c52d97d |
| AI-6 + AI-7 | 长程用户记忆（user_memory 表 + 规则式抽取/注入 + 清理）+ 可操作工具与人工确认（create_event/create_todo + SSE confirmation_request + 确认端点 + Flutter 确认卡 + 流式 done 修复）；后端 371 单测 + e2e 98 全绿、前端 96 测试 + analyze 干净 | b4e24e9 |
| AI-9 | 代理化流式协议（tool_start/tool_end SSE 事件 + Flutter 工具步骤卡 running→success/error + confirmation_decision case 修复）；后端 377 单测 + e2e 98 全绿、前端 102 测试 + analyze 干净 | dcbffb5 |
| AI-8 | 上下文压缩（ai_conversations.summary + ConversationCompactor 同步折叠压缩 >40 留 12 + buildMessages 注入摘要 + 旧 50 硬删改 80 兜底）；后端 389 单测 + e2e 98 全绿 | e82d1ee |
| AI-11 | 知识库文档接入（POST /ai/knowledge/upload + pdf-parse v2/mammoth 解析 + chunkText + ai_knowledge_chunks postgres-only + BullMQ knowledge 队列降级同步 + union 向量检索 + 管理台上传 UI）；后端 417 单测 + build 通过 | aa021a6 |
| AI-10 | 子代理委托 + Skills（SubAgentOrchestrator + calendar/stats/organizer 只读子代理 + week-plan 技能 + router delegate 意图 + 技能短路）；后端 438 单测 + e2e 98 全绿 | 018edb0 |
| AI-10.1 | 委托前端入口（AiChatProvider 技能/复杂触发词分流非流式 /ai/chat）；前端 107 测试 + analyze 干净 | 506552a |
| PL-7 + PL-8 | 定时任务框架（@nestjs/schedule：每小时过期会话/验证码/登录锁/已读通知清理 + 每日统计快照通知管理员）+ 特性开关（FeatureFlagsService + FeatureDisabledGuard + @FeatureFlag + FEATURE_*_ENABLED env）；后端单测 450 + e2e 98 全绿 | 71b10fc |
