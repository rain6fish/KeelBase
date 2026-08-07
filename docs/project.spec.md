# ShiYu-AppBase App 全栈开发平台 — 项目规格说明 (Spec)

> 版本：v1.0
> 项目名：ShiYu-AppBase（App 全栈开发平台）
> 前端：Front-Flutter | 后端：Server-Nodejs

---

## 1. 概述

### 1.1 项目目标

构建一个 App 前后端全栈开发基座平台，以此为基座可快速开发新的全栈应用。覆盖认证、事件管理、文件上传、用户管理、AI 智能助手等通用能力，开箱即用。

### 1.2 技术栈

| 层 | 技术 | 版本 | 选型理由 |
|----|------|------|---------|
| 前端框架 | Flutter + Material 3 | 3.x | 三端统一（iOS/Android/Web） |
| 状态管理 | Provider (ChangeNotifier) | 6.x | 轻量、官方推荐、无模板代码 |
| 网络层 | Dio | 5.x | 拦截器机制支持 JWT 自动刷新 |
| 路由 | GoRouter | 17.x | 声明式 + 重定向守卫 |
| 本地存储 | SharedPreferences + flutter_secure_storage | — | 主题偏好 + Token 安全存储 |
| 后端框架 | NestJS | 11.x | 模块化、装饰器驱动、TypeScript 原生 |
| ORM | TypeORM | 1.x | 支持 SQLite/PG 切换 |
| 认证 | JWT (access + refresh token) | — | 轮换策略 + 哈希存储 + 多设备会话 |
| 校验 | class-validator + Joi | — | DTO + 环境变量双重校验 |
| 缓存/队列 | Redis 7 + CacheManager + BullMQ | — | 缓存层 + 异步任务队列（Phase 3） |
| 邮件 | nodemailer + SMTP | — | 验证码/重置/通知三模板，未配置降级 |
| 推送 | 极光 JPush（抽象 PushService） | — | 可切换 FCM/APNs |
| 图片处理 | sharp | — | 光栅图转 WebP + 尺寸上限 |
| 对象存储 | 本地磁盘 / S3 兼容（MinIO/OSS） | — | StorageService 抽象 |
| LLM 集成 | 原生 fetch（零依赖） | — | 一个 Provider 类复用全部 OpenAI 兼容模型 |

---

## 2. 项目结构

```
ShiYu-AppBase/
├── Front-Flutter/                 # Flutter 前端
│   ├── lib/
│   │   ├── main.dart              # 入口：依赖注入 + MultiProvider
│   │   ├── app.dart               # App widget：主题 + 路由 + i18n
│   │   ├── core/                  # 核心基础设施
│   │   │   ├── api/               # ApiClient (Dio) + ApiResponse
│   │   │   ├── config/            # AppConfig
│   │   │   ├── constants/         # 全局常量
│   │   │   ├── errors/            # 异常类型
│   │   │   ├── i18n/              # AppLocalizations (zh/en)
│   │   │   ├── router/            # GoRouter + 路由守卫
│   │   │   ├── security/          # SecureStorageService
│   │   │   ├── services/          # 主题/连接/缓存/日志
│   │   │   ├── theme/             # AppTheme 深浅色
│   │   │   ├── time/              # TimeProvider
│   │   │   ├── utils/             # validators
│   │   │   └── widgets/           # AppShell/Loading/Error/Toast/Skeleton/FormField
│   │   └── features/              # 功能模块（按 Clean Architecture 分层）
│   │       ├── auth/              # 登录/注册/忘记密码/重置/邮箱验证
│   │       ├── dashboard/         # 首页
│   │       ├── events/            # 日历事件
│   │       ├── explore/           # 发现页
│   │       ├── ai/                # AI 智能助手（对话/历史）
│   │       ├── notifications/     # 站内通知
│   │       ├── search/            # 全局搜索
│   │       ├── sessions/          # 多设备会话管理
│   │       ├── legal/             # 隐私政策/服务条款
│   │       ├── profile/           # 个人中心
│   │       ├── settings/          # 设置
│   │       ├── splash/            # 启动页
│   │       ├── upload/            # 文件上传
│   │       └── users/             # 用户管理
│   └── test/
│
├── Server-Nodejs/                 # NestJS 后端
│   ├── src/
│   │   ├── main.ts                # 启动入口
│   │   ├── app.module.ts          # 根模块
│   │   ├── config/                # 环境变量校验 + 数据源配置
│   │   ├── common/                # 共享：entities/dto/filters/interceptors/seed
│   │   ├── auth/                  # 认证模块（登录/注册/OAuth/密码/验证/会话）
│   │   ├── users/                 # 用户模块
│   │   ├── events/                # 事件模块
│   │   ├── health/                # 健康检查
│   │   ├── metrics/               # Prometheus 指标
│   │   ├── upload/                # 文件上传
│   │   ├── storage/               # 对象存储抽象（local/s3）
│   │   ├── mail/                  # 邮件服务（nodemailer + 模板）
│   │   ├── notifications/         # 站内通知 + SSE 实时推送
│   │   ├── push/                  # 推送抽象（极光/noop）
│   │   ├── queue/                 # BullMQ 异步队列
│   │   ├── search/                # 全局搜索
│   │   ├── operation-audit/       # 通用操作审计
│   │   └── ai/                    # AI Agent 模块
│   │       ├── providers/         # LLM Provider 工厂
│   │       ├── tools/             # 工具注册表
│   │       ├── conversation/      # 对话管理
│   │       ├── insights/          # 数据洞察
│   │       ├── knowledge/         # RAG 知识库
│   │       └── ai.service.ts      # 编排核心
│   ├── test/                      # E2E 测试
│   ├── migrations/                # 数据库迁移
│   └── uploads/                   # 上传文件
│
├── docs/                          # 设计文档
├── CLAUDE.md                      # 开发指南 & 约定
├── docker-compose.yml
├── Dockerfile
└── nginx.conf
```

---

## 3. 前端架构

### 3.1 数据流

```
用户操作 → Provider 方法 → Repository → RemoteDataSource → Dio/ApiClient → API → Model → notifyListeners() → UI 重建
```

### 3.2 核心约定

| 约定 | 规则 |
|------|------|
| 分层 | features/{name}/{data,domain,presentation} |
| 组件 | Screen = StatelessWidget + context.watch；Widget = 哑组件 |
| 主题 | 通过 AppTheme 获取，禁止硬编码颜色 |
| i18n | 所有用户可见文本走 AppLocalizations，禁止硬编码字符串 |
| 路由 | GoRouter + StatefulShellRoute.indexedStack + 重定向守卫 |
| 文件名 | snake_case.dart | 类名 PascalCase | 变量 camelCase |

### 3.3 底部导航（AppShell）

5 个 Tab 插槽，其中第 3 个（More）不映射路由，打开 ActionSheet：

| 索引 | Tab | 路由 | 说明 |
|------|-----|------|------|
| 0 | Home | / | DashboardPage |
| 1 | Events | /events | EventsListPage |
| 2 | More | — | showMoreMenuSheet （ActionSheet） |
| 3 | Explore | /explore | ExplorePage |
| 4 | AI | /ai | AiChatPage |

### 3.4 通用组件

| 组件 | 用途 |
|------|------|
| LoadingWidget | 居中加载指示器 |
| AppErrorView | 错误页面 + 重试 |
| AppEmptyView | 空状态页面 |
| AppToast | Toast 通知 |
| AppSkeleton | 骨架屏 |
| AppFormField | 表单输入 |
| PaginatedListView | 分页列表 |

---

## 4. 后端架构

### 4.1 模块化结构

每个功能模块遵循 NestJS 标准：

```
feature/
├── feature.module.ts      # 模块定义（imports/controllers/providers/exports）
├── feature.controller.ts   # 路由 + Swagger 装饰器
├── feature.service.ts      # 业务逻辑
├── feature.entity.ts       # TypeORM 实体
└── dto/                    # 请求/响应 DTO
```

### 4.2 全局基础设施

| 组件 | 类型 | 说明 |
|------|------|------|
| JwtAuthGuard | APP_GUARD | 全局 JWT 认证，@Public() 跳过 |
| PoliciesGuard | APP_GUARD | 全局 CASL 策略守卫，@CheckPolicies() 路由级 + @CurrentAbility() 行级 |
| ThrottlerGuard | APP_GUARD | 全局速率限制（60 次/分钟） |
| ResponseInterceptor | APP_INTERCEPTOR | 统一响应包装；@Raw() 端点跳过包装 |
| LoggerModule | Module | pino 结构化日志（dev=pino-pretty，其他=JSON） |
| AllExceptionsFilter | APP_FILTER | 全局异常捕获 |
| ValidationPipe | APP_PIPE | whitelist + forbidNonWhitelisted + transform |
| MetricsMiddleware | Middleware | 记录 HTTP 指标（counter/histogram/gauge） |
| pino-http | Middleware | HTTP 请求/响应日志（含响应时间） |

### 4.6 可观测性

| 能力 | 说明 |
|------|------|
| 结构化日志 | pino JSON 输出，`LOG_LEVEL` 控制级别；dev 用 pino-pretty |
| HTTP 指标 | `GET /api/v1/metrics`（@Public + 跳过限流），Prometheus 文本格式：http_requests_total / http_request_duration_seconds / http_requests_in_flight + Node 默认指标 |
| 链路追踪 | OpenTelemetry auto-instrumentation，`OTEL_ENABLED=true` 启用，导出到 `OTEL_EXPORTER_OTLP_ENDPOINT` |

### 4.5 CASL 授权

基于能力（Ability）的授权，全局 `PoliciesGuard` 在 JwtAuthGuard 之后执行：

- 能力规则由 `CaslAbilityFactory`（`src/common/casl/`）定义：
  - `admin` → `can('manage', 'all')`
  - `user` → `can('manage', 'User', { id: sub })`、`can('manage', 'Event', { userId: sub })`
- 路由级：`@CheckPolicies((ability) => ability.can('manage', 'all'))` 声明所需策略
- 行级：`@CurrentAbility()` 注入能力，`ability.cannot('read', subject('Event', event))` 校验实例
- JWT access token 的 payload 中包含 `role` 字段（`user` / `admin`）
- 数据级所有权校验（事件属于本人、用户资料本人或管理员）统一走 ability

### 4.3 API 设计规范

```
URL 格式: /api/v1/{resources}    （名词复数，禁止动词）
方法语义: GET=查询  POST=创建  PUT=更新  DELETE=删除
分页:     ?page=1&limit=20&sort=createdAt&order=desc
字段命名: 统一 camelCase
时间格式: ISO 8601 字符串
布尔字段: 禁止 is_ 前缀
空值:     null 而非空字符串
```

### 4.4 全局响应结构

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {},
  "timestamp": "2026-07-24T09:12:55Z"
}
```

---

## 5. API 端点汇总

### 5.1 认证模块

| Method | Path | Auth | 限流 | 说明 |
|--------|------|------|------|------|
| POST | /api/v1/auth/register | No | 3/m | 注册 |
| POST | /api/v1/auth/login | No | 20/m | 登录 |
| POST | /api/v1/auth/refresh | No | — | 刷新 token |
| GET | /api/v1/auth/me | Yes | — | 当前用户信息 |
| POST | /api/v1/auth/oauth | No | 10/m | OAuth 第三方登录（Google/Apple/WeChat/Alipay），新用户自动注册 |
| GET | /api/v1/auth/oauth/providers | No | — | 已启用 OAuth 提供商列表及元数据 |
| POST | /api/v1/auth/forgot-password | No | 5/m | 忘记密码：发送重置邮件（防枚举统一响应） |
| POST | /api/v1/auth/reset-password | No | 5/m | 重置密码（邮件链接 token） |
| POST | /api/v1/auth/verify-email | No | 5/m | 邮箱验证（提交 6 位验证码） |
| POST | /api/v1/auth/resend-verification | No | 5/m | 重发邮箱验证码（防枚举） |
| POST | /api/v1/auth/logout | Yes | — | 登出当前设备 |
| GET | /api/v1/auth/sessions | Yes | — | 登录设备会话列表（含 isCurrent） |
| DELETE | /api/v1/auth/sessions/:id | Yes | — | 远程登出指定会话 |

### 5.2 用户模块

| Method | Path | Auth | 角色 | 所有权 | 说明 |
|--------|------|------|------|--------|------|
| GET | /api/v1/users | Yes | ADMIN | — | 用户列表（分页） |
| POST | /api/v1/users | Yes | ADMIN | — | 创建用户 |
| PATCH | /api/v1/users/:id/role | Yes | ADMIN | — | 修改用户角色 |
| GET | /api/v1/users/:id | Yes | — | 本人/管理员 | 用户详情 |
| PUT | /api/v1/users/:id | Yes | — | 本人/管理员 | 更新用户 |
| DELETE | /api/v1/users/:id | Yes | — | 本人/管理员 | 删除用户（不能删自己/最后一个 admin） |

> admin 端点（`GET /users`、`POST /users`、`PATCH /users/:id/role`）仅管理员（`role: admin`）可访问（`@CheckPolicies((a) => a.can('manage', 'all'))`），普通用户返回 403。行级校验走 CASL ability。删除/降级最后一名管理员被拒绝（防系统锁死）。

### 5.3 事件模块

| Method | Path | Auth | 所有权 | 说明 |
|--------|------|------|--------|------|
| POST | /api/v1/events | Yes | 创建者 | 创建事件 |
| GET | /api/v1/events | Yes | 本人 | 范围查询事件 |
| GET | /api/v1/events/search | Yes | 本人 | 搜索事件 |
| GET | /api/v1/events/admin/all | Yes | ADMIN | 全量事件列表（分页） |
| DELETE | /api/v1/events/admin/:id | Yes | ADMIN | 删除任意事件 |
| GET | /api/v1/events/:id | Yes | 本人/管理员 | 事件详情 |
| PUT | /api/v1/events/:id | Yes | 本人/管理员 | 更新事件 |
| DELETE | /api/v1/events/:id | Yes | 本人/管理员 | 删除事件 |

### 5.4 上传模块

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | /api/v1/upload | Yes | 上传文件（multipart/form-data，最大 10MB） |

### 5.5 AI 模块

| Method | Path | Auth | 限流 | 说明 |
|--------|------|------|------|------|
| POST | /api/v1/ai/chat | Yes | 30/m | 非流式对话 |
| POST | /api/v1/ai/chat/stream | Yes | 30/m | SSE 流式对话 |
| POST | /api/v1/ai/insights | Yes | 30/m | 数据洞察报告（事件统计聚合 + 文本摘要） |
| GET | /api/v1/ai/conversations | Yes | 30/m | 对话历史列表（已接通 ConversationService） |
| GET | /api/v1/ai/conversations/:id | Yes | 30/m | 单个对话完整消息（继续对话） |
| DELETE | /api/v1/ai/conversations/:id | Yes | 30/m | 删除指定对话（本人所有权校验） |
| DELETE | /api/v1/ai/conversations | Yes | 30/m | 清空所有对话 |
| POST | /api/v1/ai/knowledge | Yes (ADMIN) | — | 创建知识条目（RAG 知识库） |
| GET | /api/v1/ai/knowledge | Yes (ADMIN) | — | 知识条目列表/搜索（?q=关键词） |
| GET | /api/v1/ai/knowledge/:id | Yes (ADMIN) | — | 知识条目详情 |
| PATCH | /api/v1/ai/knowledge/:id | Yes (ADMIN) | — | 更新知识条目 |
| DELETE | /api/v1/ai/knowledge/:id | Yes (ADMIN) | — | 删除知识条目 |

> 对话历史持久化于 ai_conversations / ai_messages 表（AI-2 后端已接通，前端列表页见 roadmap AI-2.1）。知识库检索为向量优先 + 全文降级（AI-5）：pgvector 语义检索，无 embedding 配置/SQLite/查询异常时自动降级 LIKE 全文（`KnowledgeService.search` 签名不变，RagAgent 零改动）。

### 5.6 审计模块（管理员）

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | /api/v1/audit/logs | Yes (ADMIN) | AI 审计日志（分页，可按 userId 过滤） |
| GET | /api/v1/audit/stats | Yes (ADMIN) | 全局 AI 用量统计 |
| GET | /api/v1/audit/operations/logs | Yes (ADMIN) | 操作审计日志（写操作，可按 userId 过滤） |
| GET | /api/v1/audit/operations/stats | Yes (ADMIN) | 操作审计统计（按 action 分组） |

> 操作审计由全局 `OperationAuditInterceptor` 自动捕获 POST/PATCH/PUT/DELETE（@SkipAudit 排除幂等/已审计端点），记录 who/when/what 供合规追溯（PL-2）。

### 5.7 通知模块（MS-1）

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | /api/v1/notifications | Yes | 通知列表（分页，本人） |
| GET | /api/v1/notifications/unread-count | Yes | 未读通知数量 |
| PATCH | /api/v1/notifications/:id/read | Yes | 标记单条已读 |
| PATCH | /api/v1/notifications/read-all | Yes | 全部标记已读 |
| DELETE | /api/v1/notifications/:id | Yes | 删除通知 |
| POST | /api/v1/notifications/stream | Yes | 通知实时推送（SSE 长连接） |

通知产生通过 `NotificationsService.create()` 供各模块调用；创建后经 `NotificationsGateway`（SSE）实时推送给在线用户（MS-3 已用 SSE 实现，替代原计划 socket.io——单向推送场景 SSE 等价且复用现有 SseClient）。通知携带结构化 `targetType/targetId`（MS-5 深链），前端点击通知跳转对应业务页（事件/对话/待办）。

### 5.8 搜索模块（PL-4）

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | /api/v1/search | Yes | 全局搜索（本人事件 + 公开用户，防泄露 email/phone/role） |

### 5.9 待办模块

| Method | Path | Auth | 所有权 | 说明 |
|--------|------|------|--------|------|
| POST | /api/v1/todos | Yes | 创建者 | 创建待办 |
| GET | /api/v1/todos | Yes | 本人 | 我的待办列表（未完成在前，按创建时间倒序） |
| PATCH | /api/v1/todos/:id | Yes | 本人/管理员 | 更新待办 |
| PATCH | /api/v1/todos/:id/complete | Yes | 本人/管理员 | 切换待办完成状态 |
| DELETE | /api/v1/todos/:id | Yes | 本人/管理员 | 删除待办 |

> 行级所有权走 CASL：`can('manage', 'Todo', { userId: user.sub })`，他人待办返回 403（同 events 模式）。

### 5.10 推送模块（MS-2）

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | /api/v1/push/tokens | Yes | 注册/更新设备推送 token |
| DELETE | /api/v1/push/tokens/:token | Yes | 注销设备推送 token |

### 5.11 其他

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | /api/v1/health | No | 健康检查 |
| GET | /api/v1/metrics | No | Prometheus 指标（裸文本，跳过限流） |
| GET | /api/v1/app/version | No | 应用版本元数据（latestVersion/minRequiredVersion/updateUrl/changelog，PL-5） |

### 5.9 推送模块（MS-2）

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | /api/v1/push/tokens | Yes | 注册/更新设备推送 token |
| DELETE | /api/v1/push/tokens/:token | Yes | 注销设备推送 token |

### 5.10 其他

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | /api/v1/health | No | 健康检查 |
| GET | /api/v1/metrics | No | Prometheus 指标（裸文本，跳过限流） |

---

## 6. 数据模型

### 6.1 User

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 用户 ID |
| username | VARCHAR | UNIQUE, 3-32, alphanumeric+_ | 用户名 |
| email | VARCHAR | UNIQUE, 255 | 邮箱 |
| password | VARCHAR | bcrypt 12 rounds | 密码哈希 |
| firstName | VARCHAR | nullable, 64 | 名（given name） |
| lastName | VARCHAR | nullable, 64 | 姓（family name） |
| nickname | VARCHAR | 1-64 | 昵称 |
| phone | VARCHAR | nullable, 20 | 手机号 |
| dateOfBirth | DATE | nullable | 生日 |
| bio | VARCHAR | nullable, 512 | 个人简介 |
| avatarUrl | VARCHAR | nullable, 256 | 头像 URL |
| role | VARCHAR | default 'user', 16 | 角色：user / admin |
| provider | VARCHAR | nullable, 32 | OAuth 提供商 |
| providerId | VARCHAR | nullable, 255 | OAuth 提供商用户 ID（AES-256-GCM 加密存储） |
| providerHash | VARCHAR | nullable | providerId 的 HMAC-SHA256 派生值，供查询 |
| phoneEncrypted | VARCHAR | nullable | 手机号加密存储 |
| emailVerified | BOOLEAN | default false | 邮箱是否已验证（AU-2） |
| emailVerificationCode | VARCHAR | nullable, SHA-256 | 邮箱验证码哈希（10 分钟有效） |
| emailVerificationExpiresAt | DATETIME | nullable | 验证码过期时间 |
| resetTokenHash | VARCHAR | nullable, SHA-256 | 密码重置 token 哈希（30 分钟有效，AU-1） |
| resetTokenExpiresAt | DATETIME | nullable | 重置 token 过期时间 |
| refreshTokenHash | VARCHAR | nullable, SHA-256 | 当前 refresh token 哈希 |
| loginAttempts | INTEGER | default 0 | 连续登录失败次数 |
| lockedUntil | DATETIME | nullable | 锁定截止时间 |
| createdAt | DATETIME | — | 注册时间 |
| updatedAt | DATETIME | — | 更新时间 |

**关联表**：
- `user_sessions`（AU-3）：jti hash + deviceId + 设备名/IP/UA/活跃/过期，多设备会话管理
- `ai_conversations` / `ai_messages`：AI 对话历史
- `ai_knowledge`：RAG 知识库条目
- `notifications`：站内通知
- `push_tokens`（MS-2.1）：设备推送 token 注册表
- `operation_audit_logs`（PL-2）：通用操作审计

### 6.2 Event

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 事件 ID |
| title | VARCHAR | 1-200 | 标题 |
| description | TEXT | nullable | 描述 |
| startTime | DATETIME | — | 开始时间 |
| endTime | DATETIME | — | 结束时间 |
| location | VARCHAR | nullable | 地点 |
| colorRole | ENUM | work/personal/... | 颜色标签 |
| isCancelled | BOOLEAN | default false | 是否取消 |
| isRecurring | BOOLEAN | default false | 是否重复 |
| userId | INTEGER | FK → User.id | 所属用户 |
| createdAt | DATETIME | — | 创建时间 |
| updatedAt | DATETIME | — | 更新时间 |

### 6.3 Todo

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 待办 ID |
| title | VARCHAR | 1-200 | 标题 |
| description | TEXT | nullable | 描述 |
| completed | BOOLEAN | default false | 是否完成 |
| dueDate | DATETIME | nullable | 截止时间（ISO 8601） |
| userId | INTEGER | FK → User.id | 所属用户 |
| createdAt | DATETIME | — | 创建时间 |
| updatedAt | DATETIME | — | 更新时间 |

### 6.4 Notification

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 通知 ID |
| userId | INTEGER | NOT NULL | 接收用户 |
| title | VARCHAR | 1-200 | 标题 |
| body | TEXT | nullable | 正文 |
| type | VARCHAR(32) | default system | 类型（reminder/system/...） |
| targetType | VARCHAR(32) | nullable | 深链目标类型（event/conversation/todo，MS-5） |
| targetId | VARCHAR(64) | nullable | 深链目标 ID（MS-5） |
| isRead | BOOLEAN | default false | 是否已读 |
| link | VARCHAR(255) | nullable | 可读链接文本 |
| createdAt / updatedAt | DATETIME | — | 时间戳 |

> 索引 `(userId, createdAt)`。`targetType/targetId` 为结构化深链字段（前端点击跳转以此为准），`link` 为可读文本（MS-5）。

---

## 7. 安全架构

### 7.1 认证安全

| 规则 | 说明 |
|------|------|
| 密码强度 | 最少 8 位，必须包含字母和数字 |
| 哈希 | bcrypt 12 轮 |
| 登录锁定 | 连续 10 次失败 → 锁定 15 分钟 |
| 登录限流 | 设备级指数退避（2^N 秒，上限 300s） |
| Token 轮换 | refresh token 每次使用后更新，旧 token 失效 |
| Token 存储 | refresh token 存 SHA-256 哈希，非明文 |
| 防枚举 | 用户不存在/密码错误返回相同提示 |
| 防时序 | 认证失败随机延迟 200-500ms |
| 会话清除 | refresh token 不匹配时清除所有会话 |

### 7.2 请求安全

| 规则 | 说明 |
|------|------|
| Body 限制 | JSON body ≤ 1MB |
| CORS | 生产环境设为具体域名白名单 |
| Helmet | 安全头部自动注入 |
| Validation | class-validator whitelist（剔除多余字段） |
| Sort 注入防护 | sort 参数白名单校验 |
| 路由守卫 | 未认证自动重定向到登录页 |

### 7.3 文件上传安全

| 规则 | 说明 |
|------|------|
| MIME 校验 | 白名单：jpg/png/gif/webp/pdf/zip |
| 扩展名校验 | 与服务端 MIME 一致 |
| 魔数校验 | 读取文件头部字节验证真实格式 |
| 大小限制 | 最大 10MB |
| 失败清理 | 魔数不匹配 → 自动删除文件 |

### 7.4 AI 功能安全

| 规则 | 说明 |
|------|------|
| 认证继承 | 所有 AI 端点继承 JwtAuthGuard |
| 数据隔离 | Tool 执行注入 userId，只查本人数据 |
| 对话隔离 | ConversationStore 以 userId 为 key 隔离 |
| 限流 | AI 端点单独限流（30 次/分钟） |
| API Key | 仅从环境变量读取，不暴露给前端 |
| Prompt 注入 | System Prompt 定义边界 + 工具参数校验 |

---

## 8. 部署架构

### 8.1 环境配置层次

```
.env                  # 默认（开发环境，SQLite）
.env.staging          # Staging（PostgreSQL）
.env.production       # 生产（PostgreSQL）
```

### 8.2 Docker 部署（生产）

```
Nginx (HTTPS) → NestJS (API) → PostgreSQL
              → Flutter Web (静态文件)
```

### 8.3 可观测性栈

通过 `docker-compose.observability.yml` 编排 Prometheus + Grafana + Jaeger + Loki：

| 组件 | 端口 | 说明 |
|------|------|------|
| Prometheus | 9090 | 抓取 `server:3000/api/v1/metrics`；evaluation 15s |
| Grafana | 3001 | 预置 Prometheus + Loki 数据源 + HTTP dashboard（匿名）；Alerting 查看告警规则 |
| Jaeger | 16686 (UI) / 4318 (OTLP) | 接收 server 的 OpenTelemetry traces |
| Loki | 3100 | 接收 pino 直推的 JSON 日志 |

**告警规则**（`infra/observability/prometheus/rules/server-alerts.yml`）：ServerDown（critical，server 不可达 1m）、高错误率（5xx > 10% 持续 5m）、高延迟（P95 > 1s 持续 5m）、高并发（在途 > 100 持续 5m）。Prometheus 数据源启用 `manageAlerts`，Grafana Alerting 页面可见。

**日志直推**：pino 通过 `pino-loki` transport 把 JSON 日志推给 Loki。`LOKI_ENABLED=true` 时启用（默认关闭）；dev 环境 pino-pretty 与 Loki 并存，生产只 Loki。标签 `app=shiyu-appbase-server`、`env=<NODE_ENV>`。

**本地开发**（server 在宿主机）：`docker compose -f docker-compose.observability.yml up -d`，Prometheus 用 `host.docker.internal:3000` 抓取；server 启动需 `OTEL_ENABLED=true OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 LOKI_ENABLED=true LOKI_URL=http://localhost:3100`。

**完整编排**（server 在容器）：`docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --build`，并把 `infra/observability/prometheus/prometheus.yml` 的 targets 改回 `server:3000`，server 叠加 `OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318`、`LOKI_URL=http://loki:3100`。

> 注意：OTel 必须通过 `import './tracing-init'` 作为 main.ts 第一个 import 生效（副作用自执行），否则 auto-instrumentation 在 http/express 加载后才 patch，trace 无法捕获。

### 8.4 迁移策略

```
开发环境： synchronize: true（自动同步）
生产环境： synchronize: false, migrationsRun: true（手动迁移）
```

---

## 9. AI Agent 架构

### 9.1 整体架构

```
用户 → AiController → AiService → ProviderFactory → LLM API
                                    ↓
                              ToolRegistry → EventsService / UsersService
                                    ↓
                              ConversationService（内存 Map + TTL）
```

### 9.2 Provider 工厂（多 LLM 可插拔）

```
LlmProviderFactory
├── register('deepseek', { baseURL: 'https://api.deepseek.com' })
│   └── OpenAICompatibleProvider（复用）
├── register('qwen', { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' })
│   └── OpenAICompatibleProvider（复用）
└── register('openai', { baseURL: 'https://api.openai.com/v1' })
    └── OpenAICompatibleProvider（复用）
```

### 9.3 工具调用流程

```
用户: "帮我查一下本月有哪些事件"
  → AiService.chat()
    → LLM.generate(messages, tools)
    → LLM 返回 tool_call: query_events(startDate, endDate)
    → ToolRegistry.execute('query_events', args, userId)
      → EventsService.getEventsForRange(start, end, userId)
    → 工具结果返回给 LLM
    → LLM 生成最终自然语言回复
  → 返回用户
```

### 9.4 模型路由

| 场景 | 模型 | 策略 |
|------|------|------|
| 日常对话 | deepseek-v4-flash | 默认，快速响应 |
| 数据洞察 | qwen-max | 中文理解最优 |
| Fallback | deepseek → qwen → openai | 自动降级 |

---

## 10. 环境变量总表

```bash
# 核心
NODE_ENV=development
PORT=3000
CORS_ORIGINS=*

# JWT
JWT_SECRET=                  # 最少 32 字符
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=          # 最少 32 字符
JWT_REFRESH_EXPIRES_IN=7d

# 数据库
DB_TYPE=sqlite                # sqlite | postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=front
DB_USER=postgres
DB_PASSWORD=postgres
DB_PATH=./data/front.sqlite

# 连接池
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=2000

# 安全
LOCKOUT_THRESHOLD=10
LOCKOUT_DURATION=15
ENCRYPTION_KEY=                   # 敏感数据加密密钥（32 字节 hex）
ENCRYPTION_HMAC_KEY=              # providerHash 派生密钥（缺省回退 ENCRYPTION_KEY）

# 可观测性
LOG_LEVEL=info
OTEL_ENABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
LOKI_ENABLED=false
LOKI_URL=http://localhost:3100

# 邮件（SMTP）
MAIL_ENABLED=false
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
SMTP_FROM=ShiYu-AppBase <no-reply@example.com>
APP_BASE_URL=http://localhost:8080

# 对象存储
STORAGE_DRIVER=local              # local | s3
S3_ENDPOINT=
S3_REGION=us-east-1
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_PUBLIC_URL=

# 推送通知
PUSH_DRIVER=none                  # none | jpush
JPUSH_APP_KEY=
JPUSH_MASTER_SECRET=

# Redis 缓存 + 异步队列
REDIS_URL=redis://localhost:6379
CACHE_ENABLED=true
CACHE_TTL=300
QUEUE_ENABLED=true

# AI Provider
AI_PROVIDER=deepseek
AI_CHAT_MODEL=deepseek-v4-flash
AI_MAX_TOKENS=4096
AI_TEMPERATURE=0.7
CONVERSATION_TTL=3600

# DeepSeek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Qwen
QWEN_API_KEY=
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# OpenAI（预留）
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1

# RAG 向量检索（AI-5）
# 可用条件：VECTOR_SEARCH_ENABLED=true + DB_TYPE=postgres + EMBEDDING_API_KEY + EMBEDDING_MODEL
# 任一不满足自动降级全文搜索
VECTOR_SEARCH_ENABLED=true
EMBEDDING_BASE_URL=
EMBEDDING_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

---

## 11. Front-Taro（主 App H5/小程序端）

主 App 的 H5/小程序渠道。分层：`services/`（API 封装）+ `stores/`（zustand）+ `pages/*/index.tsx`。已实现功能（PL-6 同步自 Flutter）：

| 功能 | 页面 | 说明 |
|------|------|------|
| 认证/事件/上传/用户/探索/设置 | splash/login/register/dashboard/events/event-form/upload/users/explore/settings | 基础功能 |
| 通知中心 | `/pages/notifications/index` | 列表/未读/已读/全部已读/删除（分页轮询，SSE 在 H5 支持有限） |
| 会话管理 | `/pages/sessions/index` | 设备列表/当前设备标记/远程登出 |

`api-client.ts` 支持 GET/POST/PUT/PATCH/DELETE，统一附带 `x-device-id` 头（后端识别当前设备标记会话 isCurrent）。

> 渠道策略：AI 对话 / 全局搜索 / 待办清单为 Flutter 重交互能力，H5 小程序轻量渠道按需再同步。

---

## 12. 管理员管理台（Front-Taro-Admin）

独立 Taro H5 管理台，与主 app 完全隔离。

| 项 | 说明 |
|------|------|
| 技术栈 | Taro 3.6 + React 18 + TS + zustand |
| 构建 | `npm run build:h5` → `dist/` 静态产物 |
| 部署 | 独立域名（建议 `admin.example.com`），与主 app 分离 |
| 认证 | 独立登录 → `GET /auth/me` 校验 `role === 'admin'`，非管理员拒绝 |
| 授权 | 全部管理 API 依赖后端 CASL `@CheckPolicies((a) => a.can('manage', 'all'))` |

**模块清单**：

| 页面 | 功能 | 依赖 API |
|------|------|---------|
| 登录 | 管理员登录（无注册入口） | POST /auth/login |
| 概览 | AI 用量统计卡片 + 操作分布 + 快捷入口 | GET /audit/stats |
| 用户管理 | 分页/搜索、角色切换、删除 | GET /users、PATCH /users/:id/role、DELETE /users/:id |
| 事件管理 | 全量事件分页、删除 | GET /events/admin/all、DELETE /events/admin/:id |
| 审计监控 | 日志分页、按 userId 过滤、统计 | GET /audit/logs、GET /audit/stats |

**安全设计**：
- 主 app 不打包/不引用任何管理页面（管理入口已从 Front-Taro 移除）
- 管理台前端仅做 UI 与角色校验；真正的越权防护在后端 CASL（普通用户 token 调管理 API 返回 403）
- 部署加固（独立域名/IP 白名单/MFA）见 roadmap D.1，属运维项

---

## 13. 通用模式

### 12.1 前端：添加新功能

```
1. features/<name>/{data,domain,presentation}
2. Model + Repository + RemoteDataSource + Provider + Page + Widget
3. i18n 字符串
4. 路由注册
5. Provider 注册到 main.dart
```

### 12.2 后端：添加新 CRUD 模块

```
1. nest g module features/xxx
2. nest g service features/xxx
3. nest g controller features/xxx
4. 创建 entity + dto
5. TypeOrmModule.forFeature → module imports
6. 注册到 app.module.ts
```

### 12.3 修改功能（文档先行）

```
1. 更新 docs/{feature}-requirements.md（业务变化）
2. 更新 docs/{feature}.spec.md（接口/数据/规则变化）
3. 修改代码
4. 更新测试
```

---

## 14. 命令速查

### 后端

| 命令 | 说明 |
|------|------|
| npm run start:dev | 开发启动（热重载） |
| npm run build | 编译 |
| npm test | 单元测试 |
| npm run test:e2e | 端到端测试 |
| npm run test:cov | 测试覆盖率 |
| npm run migration:generate | 生成迁移文件 |
| npm run migration:run | 执行迁移 |

### 前端

| 命令 | 说明 |
|------|------|
| flutter run | 运行（设备/模拟器） |
| flutter run -d chrome | Web 运行 |
| flutter test | 测试 |
| flutter analyze | 静态分析 |

### Docker

| 命令 | 说明 |
|------|------|
| docker compose up --build | 开发构建启动 |
| docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d | 生产启动 |
