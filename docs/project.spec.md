# KeelBase App 全栈开发平台 — 项目规格说明 (Spec) / KeelBase App Full-Stack Development Platform — Project Specification (Spec)

> 版本：v1.0
> Version: v1.0

> 项目名：KeelBase（App 全栈开发平台）
> Project name: KeelBase (App full-stack development platform)

> 前端：Front-Flutter | 后端：Server-NestJS
> Frontend: Front-Flutter | Backend: Server-NestJS

---

## 1. 概述 / 1. Overview

### 1.1 项目目标 / 1.1 Project Goals

构建一个 App 前后端全栈开发基座平台，以此为基座可快速开发新的全栈应用。覆盖认证、事件管理、文件上传、用户管理、AI 智能助手等通用能力，开箱即用。

Build an App frontend-backend full-stack development base platform, on which new full-stack applications can be developed quickly. It covers common capabilities such as authentication, event management, file upload, user management, and an AI assistant, ready to use out of the box.

**差异化定位（2026-08-12 确立）**：KeelBase 的回答是「怎么快速做出一个带 AI、业务安全、三端可用的应用」——不做同类快速开发平台。主线是**业务安全的 AI Agent harness**（开发期 AI 生成业务模块 + 运行时 AI 安全治理，双叙事），三个受益方：开发者（开发期 AI + AI 规则层）、终端用户（运行时 AI 真的会干活）、企业管理者（数据不出域 + AI 全程可审计）。管理台是 hygiene 非卖点，后台功能不当卖点讲。

**Differentiation positioning (established 2026-08-12)**: KeelBase's answer is "how to quickly build an app that has AI, business security, and is usable on three platforms" — it is not another rapid-development platform. The main thread is a **business-safe AI Agent harness** (development-time AI generation of business modules + runtime AI security governance, a dual narrative), with three beneficiaries: developers (development-time AI + AI rule layer), end users (runtime AI that actually gets things done), and enterprise managers (data never leaves the domain + fully auditable AI). The admin console is hygiene, not a selling point; backend features are not presented as selling points.

### 1.2 技术栈 / 1.2 Tech Stack

| 层 / Layer | 技术 / Technology | 版本 / Version | 选型理由 / Rationale |
|----|------|------|---------|
| 前端框架 / Frontend framework | Flutter + Material 3 | 3.x | 三端统一（iOS/Android/Web） / Unified across three platforms (iOS/Android/Web) |
| 状态管理 / State management | Provider (ChangeNotifier) | 6.x | 轻量、官方推荐、无模板代码 / Lightweight, officially recommended, no boilerplate |
| 网络层 / Networking | Dio | 5.x | 拦截器机制支持 JWT 自动刷新 / Interceptor mechanism supporting automatic JWT refresh |
| 路由 / Routing | GoRouter | 17.x | 声明式 + 重定向守卫 / Declarative + redirect guards |
| 本地存储 / Local storage | SharedPreferences + flutter_secure_storage | — | 主题偏好 + Token 安全存储 / Theme preferences + secure token storage |
| 后端框架 / Backend framework | NestJS | 11.x | 模块化、装饰器驱动、TypeScript 原生 / Modular, decorator-driven, TypeScript-native |
| ORM | TypeORM | 1.x | 支持 SQLite/PG 切换 / Supports switching between SQLite/PG |
| 认证 / Authentication | JWT (access + refresh token) | — | 轮换策略 + 哈希存储 + 多设备会话 / Rotation strategy + hash storage + multi-device sessions |
| 校验 / Validation | class-validator + Joi | — | DTO + 环境变量双重校验 / Dual validation of DTOs + environment variables |
| 缓存/队列 / Cache/Queue | Redis 7 + CacheManager + BullMQ | — | 缓存层 + 异步任务队列（已实现；`CACHE_ENABLED=false` 直查库、`QUEUE_ENABLED=false` 降级同步执行） / Cache layer + async task queue (implemented; `CACHE_ENABLED=false` bypasses cache, `QUEUE_ENABLED=false` degrades to sync execution) |
| 邮件 / Email | nodemailer + SMTP | — | 验证码/重置/通知三模板，未配置降级 / Three templates (verification/reset/notification), degrades when unconfigured |
| 推送 / Push | 极光 JPush（抽象 PushService） / JPush (abstracted via PushService) | — | 可切换 FCM/APNs / Switchable to FCM/APNs |
| 图片处理 / Image processing | sharp | — | 光栅图转 WebP + 尺寸上限 / Raster images to WebP + size cap |
| 对象存储 / Object storage | 本地磁盘 / S3 兼容（MinIO/OSS） / Local disk / S3-compatible (MinIO/OSS) | — | StorageService 抽象 / StorageService abstraction |
| LLM 集成 / LLM integration | 原生 fetch（零依赖） / Native fetch (zero dependencies) | — | 一个 Provider 类复用全部 OpenAI 兼容模型 / One Provider class reused across all OpenAI-compatible models |

---

## 2. 项目结构 / 2. Project Structure

```
KeelBase/
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
├── Server-NestJS/                 # NestJS 后端
│   ├── src/
│   │   ├── main.ts                # 启动入口（OTel init → Nest → pino → Swagger）
│   │   ├── app.module.ts          # 根模块
│   │   ├── config/                # 环境变量校验（Joi）+ 数据源配置
│   │   ├── common/                # 共享：entities/dto/casl/filters/interceptors/seed/modules-manifest
│   │   ├── auth/                  # 认证模块（登录/注册/OAuth/OIDC/MFA/密码/验证/会话）
│   │   ├── users/                 # 用户模块
│   │   ├── events/                # 事件模块
│   │   ├── todos/                 # 待办模块
│   │   ├── health/                # 健康检查
│   │   ├── metrics/               # Prometheus 指标
│   │   ├── upload/                # 文件上传
│   │   ├── storage/               # 对象存储抽象（local/s3）
│   │   ├── mail/                  # 邮件服务（nodemailer + 模板）
│   │   ├── sms/                   # 短信服务（console/aliyun，SMS_DRIVER）
│   │   ├── notifications/         # 站内通知 + SSE 实时推送
│   │   ├── push/                  # 推送抽象（极光/noop）
│   │   ├── queue/                 # BullMQ 异步队列
│   │   ├── realtime/              # WebSocket 双向通道（RG-6，/ws）
│   │   ├── search/                # 全局搜索
│   │   ├── operation-audit/       # 通用操作审计
│   │   ├── feature-flags/         # 特性开关（PL-8/EASY-3，FEATURE_*_ENABLED + APP_PRESET）
│   │   ├── maintenance-tasks/     # 定时任务（PL-7，@nestjs/schedule cron）
│   │   ├── settings/              # 动态配置中心（RG-2，Settings 表 + 维护模式）
│   │   ├── circuit-breaker/       # 外部依赖熔断（RG-1）
│   │   ├── alert-webhook/         # 异常告警 Webhook（RG-4，钉钉/飞书/Slack）
│   │   ├── app-version/           # 应用版本元数据 + 能力清单（PL-5/MOD-4）
│   │   ├── admin/                 # 管理台聚合端点（overview/monitor/sessions/headless-keys/广播）
│   │   ├── org/                   # 组织架构（ORG：组织/部门/成员/邀请/申请）
│   │   ├── points/                # 积分/签到/排行榜/成就（GROWTH-3）
│   │   ├── feedback/              # 应用内反馈（G-1）
│   │   ├── data-import/           # 数据导入（POV-2，CSV 批量）
│   │   ├── templates/             # 模板市场（PL-9）
│   │   ├── marketing/             # 运营邮件（G-3）
│   │   ├── form-builder/          # 表单构建（PL-10）
│   │   ├── plugins/               # 插件宿主（PL-11）
│   │   ├── webhooks/              # Webhook 订阅（PL-14）
│   │   ├── flows/                 # 工作流引擎（FLOW：定义/发起/审批/回滚）
│   │   ├── mcp/                   # MCP 出口 + 外部 MCP 网关（HS-10）
│   │   ├── headless/              # Headless API（AI-19，API Key）
│   │   ├── contracts/             # 合同模块（业务示例）
│   │   ├── suppliers/             # 供应商模块（业务示例）
│   │   ├── tags/                  # 标签模块（业务示例）
│   │   ├── notes/                 # 笔记模块（业务示例）
│   │   ├── books/                 # 图书模块（业务示例）
│   │   ├── posts/                 # 帖子/社区动态（GROWTH-2，点赞/评论/关注）
│   │   ├── crm/                   # AI CRM 旗舰应用（客户/订单/跟进/任务/风险）
│   │   ├── pm/                    # AI Project Management 旗舰应用（项目/里程碑/任务/风险）
│   │   ├── approval/              # AI Approval 旗舰应用（审批请求/政策）
│   │   └── ai/                    # AI Agent 模块
│   │       ├── providers/         # LLM Provider 工厂（deepseek/qwen/openai/ollama）
│   │       ├── tools/             # 工具注册表
│   │       ├── conversation/      # 对话管理
│   │       ├── memory/            # 长期记忆
│   │       ├── confirmation/      # 写操作确认（HS-9）
│   │       ├── tool-effects/      # AI 副作用记录（HS-3/P0-15）
│   │       ├── trace/             # 对话执行轨迹（P0-14）
│   │       ├── insights/          # 数据洞察
│   │       ├── knowledge/         # RAG 知识库
│   │       ├── rag/               # 检索（pgvector + LIKE 降级，AI-5）
│   │       ├── eval/              # 评测体系（AI-20/HS-1）
│   │       ├── audit/             # AI 审计（HS-11 哈希链）
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

## 3. 前端架构 / 3. Frontend Architecture

### 3.1 数据流 / 3.1 Data Flow

```
用户操作 → Provider 方法 → Repository → RemoteDataSource → Dio/ApiClient → API → Model → notifyListeners() → UI 重建
```

### 3.2 核心约定 / 3.2 Core Conventions

| 约定 / Convention | 规则 / Rule |
|------|------|
| 分层 / Layering | features/{name}/{data,domain,presentation} |
| 组件 / Components | Screen = StatelessWidget + context.watch；Widget = 哑组件 / Screen = StatelessWidget + context.watch; Widget = presentational component |
| 主题 / Theme | 通过 AppTheme 获取，禁止硬编码颜色 / Obtained via AppTheme; hardcoded colors are forbidden |
| i18n | 所有用户可见文本走 AppLocalizations，禁止硬编码字符串 / All user-visible text goes through AppLocalizations; hardcoded strings are forbidden |
| 路由 / Routing | GoRouter + StatefulShellRoute.indexedStack + 重定向守卫 / GoRouter + StatefulShellRoute.indexedStack + redirect guards |
| 文件名 / Filenames | snake_case.dart | 类名 PascalCase | 变量 camelCase |

### 3.3 底部导航（AppShell） / 3.3 Bottom Navigation (AppShell)

5 个 Tab 插槽，其中第 3 个（More）不映射路由，打开 ActionSheet：

5 tab slots; the 3rd one (More) maps to no route and opens an ActionSheet:

| 索引 / Index | Tab | 路由 / Route | 说明 / Description |
|------|-----|------|------|
| 0 | Home | / | DashboardPage |
| 1 | Events | /events | EventsListPage |
| 2 | More | — | showMoreMenuSheet （ActionSheet） |
| 3 | Explore | /explore | ExplorePage |
| 4 | AI | /ai | AiChatPage |

### 3.4 通用组件 / 3.4 Common Components

| 组件 / Component | 用途 / Purpose |
|------|------|
| LoadingWidget | 居中加载指示器 / Centered loading indicator |
| AppErrorView | 错误页面 + 重试 / Error page + retry |
| AppEmptyView | 空状态页面 / Empty state page |
| AppToast | Toast 通知 / Toast notifications |
| AppSkeleton | 骨架屏 / Skeleton screen |
| AppFormField | 表单输入 / Form input |
| PaginatedListView | 分页列表 / Paginated list |

---

## 4. 后端架构 / 4. Backend Architecture

### 4.1 模块化结构 / 4.1 Modular Structure

每个功能模块遵循 NestJS 标准：

Each feature module follows the NestJS standard:

```
feature/
├── feature.module.ts      # 模块定义（imports/controllers/providers/exports）
├── feature.controller.ts   # 路由 + Swagger 装饰器
├── feature.service.ts      # 业务逻辑
├── feature.entity.ts       # TypeORM 实体
└── dto/                    # 请求/响应 DTO
```

### 4.2 全局基础设施 / 4.2 Global Infrastructure

| 组件 / Component | 类型 / Type | 说明 / Description |
|------|------|------|
| FeatureDisabledGuard | APP_GUARD | 全局特性开关守卫，@FeatureFlag(key) 特性关闭时返回 404 / Global feature-flag guard; returns 404 when the feature behind @FeatureFlag(key) is disabled |
| JwtAuthGuard | APP_GUARD | 全局 JWT 认证，@Public() 跳过 / Global JWT authentication; skipped via @Public() |
| MaintenanceGuard | APP_GUARD | 维护模式守卫，settings.maintenance_mode=true 时非 admin 请求返回 503，@SkipMaintenance() 豁免 / Maintenance-mode guard; non-admin requests return 503 when settings.maintenance_mode=true, exempted via @SkipMaintenance() |
| PoliciesGuard | APP_GUARD | 全局 CASL 策略守卫，@CheckPolicies() 路由级 + @CurrentAbility() 行级 / Global CASL policy guard; route-level via @CheckPolicies() + row-level via @CurrentAbility() |
| ThrottlerGuard | APP_GUARD | 全局速率限制（60 次/分钟） / Global rate limiting (60 requests/minute) |
| ResponseInterceptor | APP_INTERCEPTOR | 统一响应包装；@Raw() 端点跳过包装 / Unified response wrapping; @Raw() endpoints skip wrapping |
| LoggerModule | Module | pino 结构化日志（dev=pino-pretty，其他=JSON） / pino structured logging (pino-pretty in dev, JSON otherwise) |
| AllExceptionsFilter | APP_FILTER | 全局异常捕获 / Global exception handling |
| ValidationPipe | APP_PIPE | whitelist + forbidNonWhitelisted + transform |
| MetricsMiddleware | Middleware | 记录 HTTP 指标（counter/histogram/gauge） / Records HTTP metrics (counter/histogram/gauge) |
| pino-http | Middleware | HTTP 请求/响应日志（含响应时间） / HTTP request/response logging (including response time) |

### 4.6 可观测性 / 4.6 Observability

| 能力 / Capability | 说明 / Description |
|------|------|
| 结构化日志 / Structured logging | pino JSON 输出，`LOG_LEVEL` 控制级别；dev 用 pino-pretty / pino JSON output; `LOG_LEVEL` controls the level; pino-pretty in dev |
| HTTP 指标 / HTTP metrics | `GET /api/v1/metrics`（@Public + 跳过限流），Prometheus 文本格式：http_requests_total / http_request_duration_seconds / http_requests_in_flight + Node 默认指标 / `GET /api/v1/metrics` (@Public + skips rate limiting), Prometheus text format: http_requests_total / http_request_duration_seconds / http_requests_in_flight + Node default metrics |
| 链路追踪 / Tracing | OpenTelemetry auto-instrumentation，`OTEL_ENABLED=true` 启用，导出到 `OTEL_EXPORTER_OTLP_ENDPOINT` / OpenTelemetry auto-instrumentation, enabled with `OTEL_ENABLED=true`, exported to `OTEL_EXPORTER_OTLP_ENDPOINT` |

### 4.5 CASL 授权 / 4.5 CASL Authorization

基于能力（Ability）的授权，全局 `PoliciesGuard` 在 JwtAuthGuard 之后执行：

Ability-based authorization; the global `PoliciesGuard` runs after JwtAuthGuard:

- 能力规则由 `CaslAbilityFactory`（`src/common/casl/`）定义：
  Ability rules are defined by `CaslAbilityFactory` (`src/common/casl/`):
  - `admin` → `can('manage', 'all')`
  - `user` → `can('manage', 'User', { id: sub })`、`can('manage', 'Event', { userId: sub })`
- 路由级：`@CheckPolicies((ability) => ability.can('manage', 'all'))` 声明所需策略
  Route-level: `@CheckPolicies((ability) => ability.can('manage', 'all'))` declares the required policy
- 行级：`@CurrentAbility()` 注入能力，`ability.cannot('read', subject('Event', event))` 校验实例
  Row-level: `@CurrentAbility()` injects the ability, `ability.cannot('read', subject('Event', event))` validates the instance
- JWT access token 的 payload 中包含 `role` 字段（`user` / `admin`）
  The JWT access token payload includes the `role` field (`user` / `admin`)
- 数据级所有权校验（事件属于本人、用户资料本人或管理员）统一走 ability
  Data-level ownership checks (events belong to self; user profile is self or admin) all go through ability

### 4.3 API 设计规范 / 4.3 API Design Conventions

```
URL 格式: /api/v1/{resources}    （名词复数，禁止动词）
方法语义: GET=查询  POST=创建  PUT=更新  DELETE=删除
分页:     ?page=1&limit=20&sort=createdAt&order=desc
字段命名: 统一 camelCase
时间格式: ISO 8601 字符串
布尔字段: 禁止 is_ 前缀
空值:     null 而非空字符串
```

### 4.4 全局响应结构 / 4.4 Global Response Structure

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {},
  "timestamp": "2026-07-24T09:12:55Z"
}
```

---

## 5. API 端点汇总 / 5. API Endpoint Summary

### 5.1 认证模块 / 5.1 Authentication Module

| Method | Path | Auth | 限流 / Rate limit | 说明 / Description |
|--------|------|------|------|------|
| POST | /api/v1/auth/register | No | 3/m | 注册 / Register |
| POST | /api/v1/auth/login | No | 20/m | 登录 / Login |
| POST | /api/v1/auth/refresh | No | — | 刷新 token / Refresh token |
| GET | /api/v1/auth/me | Yes | — | 当前用户信息 / Current user info |
| POST | /api/v1/auth/oauth | No | 10/m | OAuth 第三方登录（Google/Apple/WeChat/Alipay），新用户自动注册 / OAuth third-party login (Google/Apple/WeChat/Alipay); auto-registers new users |
| GET | /api/v1/auth/oauth/providers | No | — | 已启用 OAuth 提供商列表及元数据 / Enabled OAuth provider list and metadata |
| POST | /api/v1/auth/forgot-password | No | 5/m | 忘记密码：发送重置邮件（防枚举统一响应） / Forgot password: sends a reset email (unified anti-enumeration response) |
| POST | /api/v1/auth/reset-password | No | 5/m | 重置密码（邮件链接 token） / Reset password (email link token) |
| POST | /api/v1/auth/verify-email | No | 5/m | 邮箱验证（提交 6 位验证码） / Email verification (submit 6-digit code) |
| POST | /api/v1/auth/resend-verification | No | 5/m | 重发邮箱验证码（防枚举） / Resend email verification code (anti-enumeration) |
| POST | /api/v1/auth/send-sms-code | No | 20/m | 发送短信验证码（防枚举统一响应，FeatureFlag sms） / Send SMS verification code (unified anti-enumeration response, FeatureFlag sms) |
| POST | /api/v1/auth/login-phone | No | 10/m | 手机号 + 验证码登录（FeatureFlag sms） / Login with phone + SMS code (FeatureFlag sms) |
| POST | /api/v1/auth/bind-phone | Yes | — | 绑定/更新手机号（校验验证码，FeatureFlag sms） / Bind/update phone number (verified by SMS code, FeatureFlag sms) |
| POST | /api/v1/auth/deactivate | Yes | — | 注销本人账号（密码确认 + 级联清理） / Deactivate own account (password confirmation + cascade cleanup) |
| GET | /api/v1/auth/export-data | Yes | — | 导出本人全量数据（数据可携带权） / Export own full data (data portability) |
| GET | /api/v1/auth/invite | Yes | — | 我的邀请信息：邀请码 + 已邀请用户列表 / My invite info: invite code + invited user list |
| POST | /api/v1/auth/mfa/setup | Yes | — | MFA：生成 TOTP secret + otpauth URL（未启用） / MFA: generate TOTP secret + otpauth URL (not yet enabled) |
| POST | /api/v1/auth/mfa/verify | Yes | — | MFA：验证绑定 code 并启用 / MFA: verify binding code and enable |
| POST | /api/v1/auth/mfa/disable | Yes | — | MFA：停用（需正确 TOTP code 确认） / MFA: disable (requires valid TOTP code) |
| POST | /api/v1/auth/change-password | Yes | — | 登录后修改密码（校验当前密码，清除强制改密标志） / Change password after login (verifies current password, clears force-change flag) |
| POST | /api/v1/auth/logout | Yes | — | 登出当前设备 / Log out of the current device |
| GET | /api/v1/auth/sessions | Yes | — | 登录设备会话列表（含 isCurrent） / List of logged-in device sessions (including isCurrent) |
| DELETE | /api/v1/auth/sessions/:id | Yes | — | 远程登出指定会话 / Remotely log out a specified session |

### 5.2 用户模块 / 5.2 User Module

| Method | Path | Auth | 角色 / Role | 所有权 / Ownership | 说明 / Description |
|--------|------|------|------|--------|------|
| GET | /api/v1/users | Yes | ADMIN | — | 用户列表（分页） / User list (paginated) |
| POST | /api/v1/users | Yes | ADMIN | — | 创建用户 / Create user |
| PATCH | /api/v1/users/:id/role | Yes | ADMIN | — | 修改用户角色 / Update user role |
| POST | /api/v1/users/:id/must-change-password | Yes | ADMIN | — | 标记用户下次登录需改密（不能对自己） / Force password change on next login (admin; cannot target self) |
| GET | /api/v1/users/:id | Yes | — | 本人/管理员 / Self/Admin | 用户详情 / User details |
| PUT | /api/v1/users/:id | Yes | — | 本人/管理员 / Self/Admin | 更新用户 / Update user |
| DELETE | /api/v1/users/:id | Yes | — | 本人/管理员 / Self/Admin | 删除用户（不能删自己/最后一个 admin） / Delete user (cannot delete self / last admin) |

> admin 端点（`GET /users`、`POST /users`、`PATCH /users/:id/role`）仅管理员（`role: admin`）可访问（`@CheckPolicies((a) => a.can('manage', 'all'))`），普通用户返回 403。行级校验走 CASL ability。删除/降级最后一名管理员被拒绝（防系统锁死）。
> The admin endpoints (`GET /users`, `POST /users`, `PATCH /users/:id/role`) are accessible only to admins (`role: admin`) (`@CheckPolicies((a) => a.can('manage', 'all'))`); regular users get 403. Row-level checks go through the CASL ability. Deleting/demoting the last admin is rejected (to prevent locking out the system).

### 5.3 事件模块 / 5.3 Event Module

| Method | Path | Auth | 所有权 / Ownership | 说明 / Description |
|--------|------|------|--------|------|
| POST | /api/v1/events | Yes | 创建者 / Creator | 创建事件 / Create event |
| GET | /api/v1/events | Yes | 本人 / Self | 范围查询事件 / Query events by range |
| GET | /api/v1/events/search | Yes | 本人 / Self | 搜索事件 / Search events |
| GET | /api/v1/events/admin/all | Yes | ADMIN | 全量事件列表（分页） / Full event list (paginated) |
| DELETE | /api/v1/events/admin/:id | Yes | ADMIN | 删除任意事件 / Delete any event |
| GET | /api/v1/events/:id | Yes | 本人/管理员 / Self/Admin | 事件详情 / Event details |
| PUT | /api/v1/events/:id | Yes | 本人/管理员 / Self/Admin | 更新事件 / Update event |
| DELETE | /api/v1/events/:id | Yes | 本人/管理员 / Self/Admin | 删除事件 / Delete event |

### 5.4 上传模块 / 5.4 Upload Module

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | /api/v1/upload | Yes | 上传文件（multipart/form-data，最大 10MB） / Upload file (multipart/form-data, max 10MB) |

### 5.5 AI 模块 / 5.5 AI Module

| Method | Path | Auth | 限流 / Rate limit | 说明 / Description |
|--------|------|------|------|------|
| POST | /api/v1/ai/chat | Yes | 30/m | 非流式对话 / Non-streaming chat |
| POST | /api/v1/ai/chat/stream | Yes | 30/m | SSE 流式对话 / SSE streaming chat |
| POST | /api/v1/ai/insights | Yes | 30/m | 数据洞察报告（事件统计聚合 + 文本摘要） / Data insights report (event statistics aggregation + text summary) |
| GET | /api/v1/ai/conversations | Yes | 30/m | 对话历史列表（已接通 ConversationService） / Conversation history list (wired to ConversationService) |
| GET | /api/v1/ai/conversations/:id | Yes | 30/m | 单个对话完整消息（继续对话） / Full messages of a single conversation (continue conversation) |
| DELETE | /api/v1/ai/conversations/:id | Yes | 30/m | 删除指定对话（本人所有权校验） / Delete a specified conversation (self-ownership check) |
| DELETE | /api/v1/ai/conversations | Yes | 30/m | 清空所有对话 / Clear all conversations |
| GET | /api/v1/ai/conversations/:id/trace | Yes | — | 对话执行轨迹（工具调用/确认/副作用，本人，P0-14） / Conversation execution trace (tool calls/confirmations/side effects, self, P0-14) |
| POST | /api/v1/ai/confirmations/:token | Yes | — | 确认 AI 写操作（create_event/create_todo，approve/reject，未知 token 404） / Confirm an AI write operation (create_event/create_todo, approve/reject, unknown token 404) |
| DELETE | /api/v1/ai/memory | Yes | — | 清除用户长期记忆（隐私） / Clear user long-term memory (privacy) |
| GET | /api/v1/ai/tools | Yes (ADMIN) | — | AI 工具清单与权限（HS-2，管理台可见） / AI tool inventory and permissions (HS-2, admin-facing) |
| GET | /api/v1/ai/tool-effects | Yes (ADMIN) | — | AI 写操作副作用记录（可按 userId 过滤，HS-3） / AI write-operation side-effect records (filterable by userId, HS-3) |
| DELETE | /api/v1/ai/tool-effects/:id | Yes (ADMIN) | — | 撤销 AI 创建的 event/todo（软删，HS-3） / Revoke an AI-created event/todo (soft delete, HS-3) |
| DELETE | /api/v1/ai/my/tool-effects/:id | Yes | — | 撤销本人 AI 创建的记录（软删，P0-15） / Revoke own AI-created record (soft delete, P0-15) |
| POST | /api/v1/ai/knowledge | Yes (ADMIN) | — | 创建知识条目（RAG 知识库） / Create a knowledge entry (RAG knowledge base) |
| POST | /api/v1/ai/knowledge/upload | Yes (ADMIN) | — | 上传文档入库（PDF/DOCX，multipart，异步向量化） / Upload a document to the knowledge base (PDF/DOCX, multipart, async vectorization) |
| GET | /api/v1/ai/knowledge | Yes (ADMIN) | — | 知识条目列表/搜索（?q=关键词） / Knowledge entry list/search (?q=keyword) |
| GET | /api/v1/ai/knowledge/stats | Yes (ADMIN) | — | 知识库统计：条目/切块/存储量（AI-16） / Knowledge base stats: entries/chunks/storage (AI-16) |
| POST | /api/v1/ai/knowledge/debug | Yes (ADMIN) | — | 检索命中调试：返回结果与分数（AI-16） / Retrieval-hit debug: results + scores (AI-16) |
| GET | /api/v1/ai/knowledge/:id | Yes (ADMIN) | — | 知识条目详情 / Knowledge entry details |
| GET | /api/v1/ai/knowledge/:id/chunks | Yes (ADMIN) | — | 文档切块预览（AI-16） / Document chunk preview (AI-16) |
| PATCH | /api/v1/ai/knowledge/:id | Yes (ADMIN) | — | 更新知识条目 / Update knowledge entry |
| DELETE | /api/v1/ai/knowledge/:id | Yes (ADMIN) | — | 删除知识条目 / Delete knowledge entry |
| GET | /api/v1/ai/eval/cases | Yes (ADMIN) | — | 评测集用例列表（AI-20） / Eval-case list (AI-20) |
| POST | /api/v1/ai/eval/cases | Yes (ADMIN) | — | 新增评测用例（AI-20） / Create an eval case (AI-20) |
| DELETE | /api/v1/ai/eval/cases/:id | Yes (ADMIN) | — | 删除评测用例（AI-20） / Delete an eval case (AI-20) |
| POST | /api/v1/ai/eval/seed | Yes (ADMIN) | — | 补齐内置安全评测用例（越权/PII/注入/写拒绝，幂等，HS-1） / Seed built-in security eval cases (privilege escalation/PII/injection/write-denial, idempotent, HS-1) |
| POST | /api/v1/ai/eval/run | Yes (ADMIN) | — | 跑评测批（逐用例调 LLM，AI-20） / Run the eval batch (LLM per case, AI-20) |
| GET | /api/v1/ai/eval/report | Yes (ADMIN) | — | 最近一次评测报告（AI-20） / Latest eval report (AI-20) |

> 对话历史持久化于 ai_conversations / ai_messages 表（AI-2 后端已接通，前端列表页见 roadmap AI-2.1）。知识库检索为向量优先 + 全文降级（AI-5）：pgvector 语义检索，无 embedding 配置/SQLite/查询异常时自动降级 LIKE 全文（`KnowledgeService.search` 签名不变，RagAgent 零改动）。
> Conversation history is persisted in the ai_conversations / ai_messages tables (AI-2 backend wired; frontend list page per roadmap AI-2.1). Knowledge-base retrieval is vector-first with full-text fallback (AI-5): pgvector semantic search, automatically falling back to LIKE full-text when there is no embedding config / on SQLite / on query errors (`KnowledgeService.search` signature unchanged, RagAgent untouched).

### 5.6 审计模块（管理员） / 5.6 Audit Module (Admin)

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| GET | /api/v1/audit/logs | Yes (ADMIN) | AI 审计日志（分页，可按 userId/orgId/since 过滤） / AI audit logs (paginated, filterable by userId/orgId/since) |
| GET | /api/v1/audit/verify | Yes (ADMIN) | AI 审计哈希链完整性校验（HS-11） / AI audit hash-chain integrity verification (HS-11) |
| GET | /api/v1/audit/stats | Yes (ADMIN) | 全局 AI 用量统计 / Global AI usage statistics |
| GET | /api/v1/audit/cost | Yes (ADMIN) | AI 成本看板：按用户×模型×意图聚合 tokens（AI-21） / AI cost dashboard: tokens aggregated by user×model×intent (AI-21) |
| POST | /api/v1/audit/feedback | Yes | 对话反馈：对某次对话点赞/点踩 + 原因（AI-18） / Conversation feedback: like/dislike a conversation + reason (AI-18) |
| GET | /api/v1/audit/operations/logs | Yes (ADMIN) | 操作审计日志（写操作，可按 userId 过滤） / Operation audit logs (write operations, filterable by userId) |
| GET | /api/v1/audit/operations/verify | Yes (ADMIN) | 操作审计哈希链完整性校验（HS-11） / Operation audit hash-chain integrity verification (HS-11) |
| GET | /api/v1/audit/operations/stats | Yes (ADMIN) | 操作审计统计（按 action 分组） / Operation audit statistics (grouped by action) |

> 操作审计由全局 `OperationAuditInterceptor` 自动捕获 POST/PATCH/PUT/DELETE（@SkipAudit 排除幂等/已审计端点），记录 who/when/what 供合规追溯（PL-2）。
> Operation auditing is automatically captured by the global `OperationAuditInterceptor` for POST/PATCH/PUT/DELETE (@SkipAudit excludes idempotent / already-audited endpoints), recording who/when/what for compliance tracing (PL-2).

### 5.7 通知模块（MS-1） / 5.7 Notification Module (MS-1)

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| GET | /api/v1/notifications | Yes | 通知列表（分页，本人） / Notification list (paginated, own) |
| GET | /api/v1/notifications/unread-count | Yes | 未读通知数量 / Unread notification count |
| PATCH | /api/v1/notifications/:id/read | Yes | 标记单条已读 / Mark single as read |
| PATCH | /api/v1/notifications/read-all | Yes | 全部标记已读 / Mark all as read |
| DELETE | /api/v1/notifications/:id | Yes | 删除通知 / Delete notification |
| POST | /api/v1/notifications/stream | Yes | 通知实时推送（SSE 长连接） / Real-time notification push (SSE long connection) |

通知产生通过 `NotificationsService.create()` 供各模块调用；创建后经 `NotificationsGateway`（SSE）实时推送给在线用户（MS-3 已用 SSE 实现，替代原计划 socket.io——单向推送场景 SSE 等价且复用现有 SseClient）。通知携带结构化 `targetType/targetId`（MS-5 深链），前端点击通知跳转对应业务页（事件/对话/待办）。

Notifications are produced via `NotificationsService.create()` for use by each module; once created, they are pushed in real time to online users through `NotificationsGateway` (SSE) (MS-3 implemented with SSE, replacing the originally planned socket.io — for one-way push scenarios SSE is equivalent and reuses the existing SseClient). Notifications carry structured `targetType/targetId` (MS-5 deep links); tapping a notification navigates the frontend to the corresponding business page (event/conversation/todo).

### 5.8 搜索模块（PL-4） / 5.8 Search Module (PL-4)

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| GET | /api/v1/search | Yes | 全局搜索（本人事件 + 公开用户，防泄露 email/phone/role） / Global search (own events + public users, prevents leaking email/phone/role) |

### 5.9 待办模块 / 5.9 Todo Module

| Method | Path | Auth | 所有权 / Ownership | 说明 / Description |
|--------|------|------|--------|------|
| POST | /api/v1/todos | Yes | 创建者 / Creator | 创建待办 / Create todo |
| GET | /api/v1/todos | Yes | 本人 / Self | 我的待办列表（未完成在前，按创建时间倒序） / My todo list (incomplete first, ordered by creation time descending) |
| PATCH | /api/v1/todos/:id | Yes | 本人/管理员 / Self/Admin | 更新待办 / Update todo |
| PATCH | /api/v1/todos/:id/complete | Yes | 本人/管理员 / Self/Admin | 切换待办完成状态 / Toggle todo completion status |
| DELETE | /api/v1/todos/:id | Yes | 本人/管理员 / Self/Admin | 删除待办 / Delete todo |

> 行级所有权走 CASL：`can('manage', 'Todo', { userId: user.sub })`，他人待办返回 403（同 events 模式）。
> Row-level ownership goes through CASL: `can('manage', 'Todo', { userId: user.sub })`; others' todos return 403 (same pattern as events).

### 5.10 推送模块（MS-2） / 5.10 Push Module (MS-2)

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | /api/v1/push/tokens | Yes | 注册/更新设备推送 token / Register/update device push token |
| DELETE | /api/v1/push/tokens/:token | Yes | 注销设备推送 token / Unregister device push token |

### 5.11 其他 / 5.11 Others

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| GET | /api/v1/health | No | 健康检查（?detail=true 返回 db/redis/queue/storage 状态，60/min 限流） / Health check (?detail=true returns db/redis/queue/storage status, 60/min rate limit) |
| GET | /api/v1/metrics | No | Prometheus 指标（裸文本，跳过限流） / Prometheus metrics (raw text, skips rate limiting) |
| GET | /api/v1/app/version | No | 应用版本元数据（latestVersion/minRequiredVersion/updateUrl/changelog，PL-5） / App version metadata (latestVersion/minRequiredVersion/updateUrl/changelog, PL-5) |
| GET | /api/v1/app/capabilities | No | 当前预设 + 启用模块清单（MOD-4，前端据此隐藏导航） / Current preset + enabled module manifest (MOD-4; frontend hides navigation accordingly) |
| GET | /api/v1/settings | Yes (ADMIN) | 全部动态配置（RG-2，实时生效） / All dynamic config (RG-2, effective immediately) |
| PUT | /api/v1/settings/:key | Yes (ADMIN) | 更新/创建动态配置（维护模式/AI 限额等） / Update/create dynamic config (maintenance mode / AI limits, etc.) |
| GET | /api/v1/admin/trash | Yes (ADMIN) | 回收站：已软删除的事件/待办（RG-3，带用户名分页） / Trash: soft-deleted events/todos (RG-3, paginated with username) |
| POST | /api/v1/admin/trash/:type/:id/restore | Yes (ADMIN) | 恢复回收站记录（type: event\|todo） / Restore trash records (type: event\|todo) |
| GET | /api/v1/admin/monitor/summary | Yes (ADMIN) | 运行状态聚合（健康/依赖/指标/告警） / Runtime status aggregation (health/deps/metrics/alerts) |
| GET | /api/v1/admin/ops/summary | Yes (ADMIN) | 运维单页聚合（派生告警 + 指标 + 近 24h 错误 + 7 天趋势） / Ops single-page aggregation (derived alerts + metrics + last-24h errors + 7-day trend) |
| GET | /api/v1/admin/overview | Yes (ADMIN) | 平台数据总览（用户/事件/待办/通知/审计/存储 + 趋势，?days=） / Platform data overview (users/events/todos/notifications/audit/storage + trends, ?days=) |
| GET | /api/v1/admin/sessions | Yes (ADMIN) | 全部在线会话（管理员视角） / All online sessions (admin view) |
| DELETE | /api/v1/admin/sessions/:id | Yes (ADMIN) | 强制下线指定会话 / Force logout a specified session |
| GET | /api/v1/admin/users/:id/detail | Yes (ADMIN) | 用户详情聚合（脱敏信息 + 会话 + 通知 + 统计） / User detail aggregation (sanitized info + sessions + notifications + stats) |
| POST | /api/v1/admin/notifications/broadcast | Yes (ADMIN) | 通知广播（全体/指定用户） / Notification broadcast (all/specified users) |
| GET | /api/v1/admin/analytics | Yes (ADMIN) | 平台数据统计：DAU/WAU/MAU/留存/功能漏斗/错误（?days=30） / Platform analytics: DAU/WAU/MAU/retention/feature funnel/errors (?days=30) |
| GET | /api/v1/admin/templates | Yes (ADMIN) | 内置示例模板列表（PL-9） / Built-in example template list (PL-9) |
| POST | /api/v1/admin/templates/:id/import | Yes (ADMIN) | 一键导入模板数据（事件/待办种子，PL-9） / One-click import of template data (event/todo seeds, PL-9) |
| POST | /api/v1/admin/marketing/send | Yes (ADMIN) | 发送运营邮件（audience=all/admin/user，周报/活动，G-3） / Send marketing email (audience=all/admin/user, G-3) |
| GET | /api/v1/admin/forms | Yes (ADMIN) | 表单定义列表（PL-10） / Form definition list (PL-10) |
| POST | /api/v1/admin/forms | Yes (ADMIN) | 创建表单定义（PL-10） / Create a form definition (PL-10) |
| PATCH | /api/v1/admin/forms/:id | Yes (ADMIN) | 更新表单定义（PL-10） / Update a form definition (PL-10) |
| DELETE | /api/v1/admin/forms/:id | Yes (ADMIN) | 删除表单定义及提交（PL-10） / Delete a form definition and its submissions (PL-10) |
| GET | /api/v1/admin/forms/:id/submissions | Yes (ADMIN) | 表单提交列表（PL-10） / Form submission list (PL-10) |
| GET | /api/v1/admin/plugins | Yes (ADMIN) | 已加载插件列表（PL-11） / Loaded plugin list (PL-11) |
| POST | /api/v1/plugins/:path | Yes | 插件路由统一入口（PL-11，插件 registerRoute 注册） / Unified plugin-route entry (PL-11, routes registered by plugins) |
| GET | /api/v1/admin/headless-keys | Yes (ADMIN) | headless API Key 列表（HS-4） / Headless API key list (HS-4) |
| POST | /api/v1/admin/headless-keys | Yes (ADMIN) | 创建 headless API Key（返回明文仅此一次，HS-4） / Create a headless API key (plaintext returned once, HS-4) |
| PATCH | /api/v1/admin/headless-keys/:id | Yes (ADMIN) | 更新 headless API Key（配额/工具范围/归属/启停，HS-4） / Update a headless API key (quota/tool scope/ownership/enable, HS-4) |
| DELETE | /api/v1/admin/headless-keys/:id | Yes (ADMIN) | 删除 headless API Key（HS-4） / Delete a headless API key (HS-4) |
| POST | /api/v1/admin/ai/chat | Yes (ADMIN) | 系统 AI 助手：平台能力/版本/工具/治理上下文，Explain/Guide/Navigate（AI-22 演进），响应含 navigateTo/toolCalls / System AI Assistant with platform context (Explain/Guide/Navigate), returns navigateTo/toolCalls |
| GET | /api/v1/admin/mcp/servers | Yes (ADMIN) | 已注册外部 MCP server 列表（HS-10） / Registered external MCP servers (HS-10) |
| POST | /api/v1/admin/mcp/servers | Yes (ADMIN) | 注册外部 MCP server（写入 Settings，HS-10） / Register an external MCP server (HS-10) |
| DELETE | /api/v1/admin/mcp/servers/:name | Yes (ADMIN) | 移除外部 MCP server（HS-10） / Remove an external MCP server (HS-10) |
| GET | /api/v1/admin/mcp/tools | Yes (ADMIN) | 发现外部 MCP 工具（缓存 30s；?force=true 刷新，HS-10） / Discover external MCP tools (30s cache; ?force=true refresh, HS-10) |
| POST | /api/v1/admin/mcp/call | Yes (ADMIN) | 调用外部 MCP 工具（强制过治理层：权限+确认+审计，HS-10） / Call an external MCP tool (forced through governance: permission+confirmation+audit, HS-10) |
| POST | /api/v1/admin/import/users | Yes (ADMIN) | 批量导入用户（CSV，POV-2） / Bulk import users (CSV, POV-2) |
| POST | /api/v1/admin/import/events | Yes (ADMIN) | 批量导入事件（CSV，POV-2） / Bulk import events (CSV, POV-2) |
| POST | /api/v1/admin/import/todos | Yes (ADMIN) | 批量导入待办（CSV，POV-2） / Bulk import todos (CSV, POV-2) |
| GET | /api/v1/forms/:slug | Yes | 读取表单定义（PL-10，按 slug） / Read a form definition (PL-10, by slug) |
| POST | /api/v1/forms/:slug/submit | Yes | 提交表单数据（按 schema 校验，PL-10） / Submit form data (schema-validated, PL-10) |
| GET | /api/v1/forms/:slug/submissions | Yes | 本人对该表单的提交记录（PL-10） / Own submissions for a form (PL-10) |
| POST | /api/v1/feedback | Yes | 应用内反馈：建议/问题/好评，通知管理员（G-1） / In-app feedback: suggestion/bug/praise, notifies admins (G-1) |
| POST | /api/v1/headless/chat | API Key | 无头对话（AI-19/HS-4）：x-api-key 认证，以 key 归属用户身份执行 / Headless chat (AI-19/HS-4): x-api-key auth, executes as the key owner |
| POST | /api/v1/mcp | Yes | MCP 出口（HS-10）：JSON-RPC（initialize/ping/tools/list/tools/call，@Raw 跳过统一包装） / MCP export (HS-10): JSON-RPC (initialize/ping/tools/list/tools/call, @Raw skips unified wrapping) |
| GET | /api/v1/webhooks | Yes | 我的 Webhook 订阅列表（PL-14，视图不含 secret） / My webhook subscriptions (PL-14, without secret) |
| POST | /api/v1/webhooks | Yes | 订阅 Webhook（PL-14：name/url/events，服务端生成 HMAC secret） / Subscribe a webhook (PL-14: name/url/events, HMAC secret generated) |
| PATCH | /api/v1/webhooks/:id | Yes | 启用/停用 Webhook（PL-14） / Enable/disable a webhook (PL-14) |
| DELETE | /api/v1/webhooks/:id | Yes | 删除 Webhook（PL-14） / Delete a webhook (PL-14) |
| POST | /api/v1/webhooks/test/:id | Yes | 测试投递（返回签名与结果，PL-14） / Test delivery (returns signature + result, PL-14) |
| WS | /ws?token=\<jwt\> | 握手 JWT | WebSocket 双向通道（RG-6）：握手失败 4401；通知推送 + AI 流式 + 通用消息；心跳 ping/pong；与 SSE 并存 / WebSocket bidirectional channel (RG-6): handshake failure 4401; notification push + AI streaming + generic messages; heartbeat ping/pong; coexists with SSE |

### 5.12 组织模块（ORG） / 5.12 Organization Module (ORG)

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | /api/v1/org/organizations | Yes (ADMIN) | 创建组织（创建者成 owner，ORG-1） / Create an organization (creator becomes owner, ORG-1) |
| GET | /api/v1/org/organizations | Yes (ADMIN) | 组织列表（含成员/部门数，ORG-1） / Organization list (with member/department counts, ORG-1) |
| GET | /api/v1/org/organizations/:id | Yes (ADMIN) | 组织详情（ORG-1） / Organization details (ORG-1) |
| PUT | /api/v1/org/organizations/:id | Yes (ADMIN) | 更新组织（ORG-1） / Update an organization (ORG-1) |
| DELETE | /api/v1/org/organizations/:id | Yes (ADMIN) | 删除组织（有成员拒绝，ORG-1） / Delete an organization (rejected when it has members, ORG-1) |
| POST | /api/v1/org/organizations/:orgId/departments | Yes (ADMIN) | 创建部门（ORG-1） / Create a department (ORG-1) |
| GET | /api/v1/org/organizations/:orgId/departments | Yes (ADMIN) | 部门扁平列表（含 parentId，前端组树，ORG-1） / Flat department list (with parentId, ORG-1) |
| PUT | /api/v1/org/departments/:id | Yes (ADMIN) | 更新部门（改名/移动上级，防环，ORG-1） / Update a department (rename/move parent, cycle-proof, ORG-1) |
| DELETE | /api/v1/org/departments/:id | Yes (ADMIN) | 删除部门（子孙上挂、成员脱离，ORG-1） / Delete a department (descendants re-parented, members detached, ORG-1) |
| GET | /api/v1/org/organizations/:orgId/members | Yes (ADMIN) | 成员列表（脱敏，ORG-1） / Member list (sanitized, ORG-1) |
| POST | /api/v1/org/organizations/:orgId/members | Yes (ADMIN) | 添加成员（重复 409，ORG-1） / Add a member (duplicate 409, ORG-1) |
| PUT | /api/v1/org/members/:id | Yes (ADMIN) | 更新成员（改角色/移部门，最后 owner 保护，ORG-1） / Update a member (role/department change, last-owner protected, ORG-1) |
| DELETE | /api/v1/org/members/:id | Yes (ADMIN) | 移除成员（最后 owner 拒绝，ORG-1） / Remove a member (last owner rejected, ORG-1) |
| POST | /api/v1/org/organizations/:orgId/invites | Yes (ADMIN) | 生成组织邀请码（ORG-6） / Generate an organization invite code (ORG-6) |
| GET | /api/v1/org/organizations/:orgId/invites | Yes (ADMIN) | 邀请列表（含使用状态，ORG-6） / Invite list (with usage status, ORG-6) |
| DELETE | /api/v1/org/invites/:id | Yes (ADMIN) | 撤销邀请（ORG-6） / Revoke an invite (ORG-6) |
| POST | /api/v1/org/requests | Yes | 提交组织申请（发起审批流，ORG-4） / Submit an organization application (starts an approval flow, ORG-4) |
| GET | /api/v1/org/requests | Yes | 我的申请列表（ORG-4） / My applications list (ORG-4) |
| GET | /api/v1/org/my | Yes | 我的组织信息 + 部门路径（ORG-7） / My organization info + department path (ORG-7) |
| GET | /api/v1/org/my/tree | Yes | 我的组织部门树（只读，含成员数，ORG-7） / My organization department tree (read-only, ORG-7) |
| GET | /api/v1/org/my/members | Yes | 我的组织成员（脱敏白名单：无 email/phone，ORG-7） / My organization members (sanitized whitelist: no email/phone, ORG-7) |

### 5.13 积分模块（GROWTH-3） / 5.13 Points Module (GROWTH-3)

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| GET | /api/v1/points/me | Yes | 我的积分概览（余额/今日是否已签/连签天数） / My points overview (balance/today-checked-in/streak) |
| POST | /api/v1/points/checkin | Yes | 每日签到（checkin_date 唯一约束防重复，重复 409） / Daily check-in (unique checkin_date prevents duplicates, duplicate 409) |
| GET | /api/v1/points/leaderboard | Yes | 积分排行榜（脱敏：仅昵称/头像/积分，不含内部 userId） / Points leaderboard (sanitized: nickname/avatar/points only) |
| GET | /api/v1/points/achievements | Yes | 我的成就（按正分毛累计判定，admin 扣分不回退） / My achievements (based on gross positive points; admin deductions don't regress) |

### 5.14 业务示例模块（合同/供应商/标签/笔记/图书） / 5.14 Business Sample Modules (Contracts/Suppliers/Tags/Notes/Books)

contracts / suppliers / tags / notes / books 五个模块接口结构相同（各带 FeatureFlag 开关），`{module}` = contracts｜suppliers｜tags｜notes｜books，本人所有权走 CASL，删除为软删可进回收站：

The five modules contracts/suppliers/tags/notes/books share an identical interface structure (each gated by its own FeatureFlag); `{module}` = contracts｜suppliers｜tags｜notes｜books, self-ownership via CASL, deletes are soft deletes recoverable from the trash:

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | /api/v1/{module} | Yes | 创建 / Create |
| GET | /api/v1/{module} | Yes | 我的列表（本人） / My list (own) |
| PATCH | /api/v1/{module}/:id | Yes | 更新（本人/管理员） / Update (self/admin) |
| DELETE | /api/v1/{module}/:id | Yes | 删除（本人/管理员，软删进回收站） / Delete (self/admin, soft delete to trash) |
| GET | /api/v1/{module}/admin/all | Yes (ADMIN) | 管理端全量列表 / Admin full list |
| DELETE | /api/v1/{module}/admin/:id | Yes (ADMIN) | 管理端删除任意（软删进回收站） / Admin delete any (soft delete to trash) |

### 5.15 帖子与社区（GROWTH-2） / 5.15 Posts & Community (GROWTH-2)

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | /api/v1/posts | Yes | 创建帖子 / Create a post |
| GET | /api/v1/posts | Yes | 我的帖子列表 / My posts list |
| PATCH | /api/v1/posts/:id | Yes | 更新帖子 / Update a post |
| DELETE | /api/v1/posts/:id | Yes | 删除帖子 / Delete a post |
| POST | /api/v1/posts/:id/like | Yes | 点赞帖子（幂等） / Like a post (idempotent) |
| DELETE | /api/v1/posts/:id/like | Yes | 取消点赞 / Unlike a post |
| POST | /api/v1/posts/:id/comments | Yes | 评论帖子 / Comment on a post |
| GET | /api/v1/posts/:id/comments | Yes | 帖子评论列表（分页） / Post comment list (paginated) |
| POST | /api/v1/posts/users/:followeeId/follow | Yes | 关注用户 / Follow a user |
| DELETE | /api/v1/posts/users/:followeeId/follow | Yes | 取消关注 / Unfollow a user |

### 5.16 工作流（FLOW） / 5.16 Workflow (FLOW)

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | /api/v1/flows/ai/generate | Yes | AI 生成流程定义（自然语言 → 流程 JSON） / AI-generate a flow definition (natural language → flow JSON) |
| POST | /api/v1/flows/definitions | Yes | 保存/发布流程定义（AI 生成确认后） / Save/publish a flow definition (after AI generation confirmation) |
| POST | /api/v1/flows/:definitionId/start | Yes | 发起流程（如 leave_approval 请假审批） / Start a flow (e.g. leave_approval) |
| GET | /api/v1/flows/tasks | Yes | 我的待办审批任务 / My pending approval tasks |
| POST | /api/v1/flows/tasks/:id/approve | Yes | 审批（approve/reject） / Approve/reject a task |
| GET | /api/v1/flows/:id | Yes | 流程实例详情 / Flow instance details |
| POST | /api/v1/flows/:id/rollback | Yes (ADMIN) | 回滚流程实例 / Roll back a flow instance |

### 5.17 AI CRM 模块 / 5.17 AI CRM Module

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | /api/v1/crm/customers | Yes | 创建客户 / Create a customer |
| GET | /api/v1/crm/customers | Yes | 客户列表（分页 + 状态/风险/关键词筛选） / Customer list (paginated + status/risk/keyword filters) |
| GET | /api/v1/crm/customers/:id | Yes | 客户详情（含订单/跟进/任务/风险） / Customer details (with orders/activities/tasks/risks) |
| PATCH | /api/v1/crm/customers/:id | Yes | 更新客户 / Update a customer |
| DELETE | /api/v1/crm/customers/:id | Yes | 删除客户（软删） / Delete a customer (soft delete) |
| GET | /api/v1/crm/customers/:id/analyze | Yes | 客户风险分析（逾期订单/任务/未解决风险） / Customer risk analysis (overdue orders/tasks/open risks) |
| GET | /api/v1/crm/customers/:id/orders | Yes | 客户订单列表 / Customer order list |
| POST | /api/v1/crm/customers/:id/orders | Yes | 创建客户订单 / Create a customer order |
| GET | /api/v1/crm/customers/:id/activities | Yes | 客户跟进记录列表 / Customer activity list |
| POST | /api/v1/crm/customers/:id/activities | Yes | 创建跟进记录 / Create an activity |
| GET | /api/v1/crm/customers/:id/tasks | Yes | 客户任务列表 / Customer task list |
| GET | /api/v1/crm/tasks | Yes | 我的跟进任务列表 / My follow-up task list |
| POST | /api/v1/crm/tasks | Yes | 创建跟进任务 / Create a follow-up task |
| POST | /api/v1/crm/tasks/:id/complete | Yes | 完成任务 / Complete a task |
| GET | /api/v1/crm/customers/:id/risks | Yes | 客户风险记录列表 / Customer risk list |
| POST | /api/v1/crm/customers/:id/risks | Yes | 创建风险记录 / Create a risk record |

### 5.18 AI Project Management 模块 / 5.18 AI Project Management Module

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | /api/v1/pm/projects | Yes | 创建项目 / Create a project |
| GET | /api/v1/pm/projects | Yes | 项目列表（分页 + 状态/关键词筛选） / Project list (paginated + status/keyword filters) |
| GET | /api/v1/pm/projects/:id | Yes | 项目详情（含里程碑/任务/风险/成员数） / Project details (with milestones/tasks/risks/member count) |
| PATCH | /api/v1/pm/projects/:id | Yes | 更新项目 / Update a project |
| DELETE | /api/v1/pm/projects/:id | Yes | 删除项目（软删） / Delete a project (soft delete) |
| GET | /api/v1/pm/projects/:id/analyze | Yes | 项目风险分析（逾期任务/里程碑/未解决风险） / Project risk analysis (overdue tasks/milestones/open risks) |
| GET | /api/v1/pm/projects/:id/members | Yes | 项目成员列表 / Project member list |
| POST | /api/v1/pm/projects/:id/members | Yes | 添加成员（owner/member） / Add a member (owner/member) |
| GET | /api/v1/pm/projects/:id/milestones | Yes | 项目里程碑列表 / Project milestone list |
| POST | /api/v1/pm/projects/:id/milestones | Yes | 创建里程碑 / Create a milestone |
| GET | /api/v1/pm/projects/:id/tasks | Yes | 项目任务列表 / Project task list |
| GET | /api/v1/pm/tasks | Yes | 我的项目任务列表 / My project task list |
| POST | /api/v1/pm/tasks | Yes | 创建项目任务 / Create a project task |
| POST | /api/v1/pm/tasks/:id/complete | Yes | 完成任务 / Complete a task |
| GET | /api/v1/pm/projects/:id/risks | Yes | 项目风险列表 / Project risk list |
| POST | /api/v1/pm/projects/:id/risks | Yes | 创建风险记录 / Create a risk record |

### 5.19 AI Approval 模块 / 5.19 AI Approval Module

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | /api/v1/approval/requests | Yes | 提交审批请求（pending） / Submit an approval request (pending) |
| GET | /api/v1/approval/requests | Yes | 我的审批请求（状态筛选） / My approval requests (status filter) |
| GET | /api/v1/approval/requests/:id | Yes | 审批请求详情 / Approval request details |
| DELETE | /api/v1/approval/requests/:id | Yes | 删除审批请求（软删） / Delete an approval request (soft delete) |
| POST | /api/v1/approval/requests/:id/review | Yes | AI 预审：按政策分级（低风险自动通过 / 高风险转人工复核） / AI pre-review: policy-tiered (low risk auto-approve / high risk to manual review) |
| POST | /api/v1/approval/requests/:id/decide | Yes | 人工复核：通过/驳回 needs_review 请求 / Manual review: approve/reject a needs_review request |
| GET | /api/v1/approval/policies | Yes | 我的审批政策列表 / My approval policy list |
| POST | /api/v1/approval/policies | Yes | 创建审批政策 / Create an approval policy |
| PATCH | /api/v1/approval/policies/:id | Yes | 更新审批政策 / Update an approval policy |
| DELETE | /api/v1/approval/policies/:id | Yes | 删除审批政策 / Delete an approval policy |

---

## 6. 数据模型 / 6. Data Model

### 6.1 User

| 字段 / Field | 类型 / Type | 约束 / Constraint | 说明 / Description |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 用户 ID / User ID |
| username | VARCHAR | UNIQUE, 3-32, alphanumeric+_ | 用户名 / Username |
| email | VARCHAR | UNIQUE, 255 | 邮箱 / Email |
| password | VARCHAR | bcrypt 12 rounds | 密码哈希 / Password hash |
| firstName | VARCHAR | nullable, 64 | 名（given name） / Given name |
| lastName | VARCHAR | nullable, 64 | 姓（family name） / Family name |
| nickname | VARCHAR | 1-64 | 昵称 / Nickname |
| phone | VARCHAR | nullable, 20 | 手机号 / Phone number |
| dateOfBirth | DATE | nullable | 生日 / Date of birth |
| bio | VARCHAR | nullable, 512 | 个人简介 / Bio |
| avatarUrl | VARCHAR | nullable, 256 | 头像 URL / Avatar URL |
| role | VARCHAR | default 'user', 16 | 角色：user / admin / Role: user / admin |
| provider | VARCHAR | nullable, 32 | OAuth 提供商 / OAuth provider |
| providerId | VARCHAR | nullable, 255 | OAuth 提供商用户 ID（AES-256-GCM 加密存储） / OAuth provider user ID (stored encrypted with AES-256-GCM) |
| providerHash | VARCHAR | nullable | providerId 的 HMAC-SHA256 派生值，供查询 / HMAC-SHA256 derived value of providerId, used for lookup |
| phoneEncrypted | VARCHAR | nullable | 手机号加密存储 / Phone number stored encrypted |
| emailVerified | BOOLEAN | default false | 邮箱是否已验证（AU-2） / Whether the email is verified (AU-2) |
| emailVerificationCode | VARCHAR | nullable, SHA-256 | 邮箱验证码哈希（10 分钟有效） / Email verification code hash (valid for 10 minutes) |
| emailVerificationExpiresAt | DATETIME | nullable | 验证码过期时间 / Verification code expiry time |
| resetTokenHash | VARCHAR | nullable, SHA-256 | 密码重置 token 哈希（30 分钟有效，AU-1） / Password reset token hash (valid for 30 minutes, AU-1) |
| resetTokenExpiresAt | DATETIME | nullable | 重置 token 过期时间 / Reset token expiry time |
| refreshTokenHash | VARCHAR | nullable, SHA-256 | 当前 refresh token 哈希 / Current refresh token hash |
| loginAttempts | INTEGER | default 0 | 连续登录失败次数 / Consecutive login failure count |
| lockedUntil | DATETIME | nullable | 锁定截止时间 / Lockout end time |
| createdAt | DATETIME | — | 注册时间 / Registration time |
| updatedAt | DATETIME | — | 更新时间 / Update time |

**关联表**： / **Related tables**:
- `user_sessions`（AU-3）：jti hash + deviceId + 设备名/IP/UA/活跃/过期，多设备会话管理
  Multi-device session management: jti hash + deviceId + device name / IP / UA / active / expiry
- `ai_conversations` / `ai_messages`：AI 对话历史
  AI conversation history
- `ai_knowledge`：RAG 知识库条目
  RAG knowledge base entries
- `notifications`：站内通知
  In-app notifications
- `push_tokens`（MS-2.1）：设备推送 token 注册表
  Device push token registry
- `operation_audit_logs`（PL-2）：通用操作审计
  General operation audit

### 6.2 Event

| 字段 / Field | 类型 / Type | 约束 / Constraint | 说明 / Description |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 事件 ID / Event ID |
| title | VARCHAR | 1-200 | 标题 / Title |
| description | TEXT | nullable | 描述 / Description |
| startTime | DATETIME | — | 开始时间 / Start time |
| endTime | DATETIME | — | 结束时间 / End time |
| location | VARCHAR | nullable | 地点 / Location |
| colorRole | ENUM | work/personal/... | 颜色标签 / Color label |
| isCancelled | BOOLEAN | default false | 是否取消 / Whether cancelled |
| isRecurring | BOOLEAN | default false | 是否重复 / Whether recurring |
| userId | INTEGER | FK → User.id | 所属用户 / Owning user |
| createdAt | DATETIME | — | 创建时间 / Creation time |
| updatedAt | DATETIME | — | 更新时间 / Update time |

### 6.3 Todo

| 字段 / Field | 类型 / Type | 约束 / Constraint | 说明 / Description |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 待办 ID / Todo ID |
| title | VARCHAR | 1-200 | 标题 / Title |
| description | TEXT | nullable | 描述 / Description |
| completed | BOOLEAN | default false | 是否完成 / Whether completed |
| dueDate | DATETIME | nullable | 截止时间（ISO 8601） / Due time (ISO 8601) |
| userId | INTEGER | FK → User.id | 所属用户 / Owning user |
| createdAt | DATETIME | — | 创建时间 / Creation time |
| updatedAt | DATETIME | — | 更新时间 / Update time |

### 6.4 Notification

| 字段 / Field | 类型 / Type | 约束 / Constraint | 说明 / Description |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 通知 ID / Notification ID |
| userId | INTEGER | NOT NULL | 接收用户 / Recipient user |
| title | VARCHAR | 1-200 | 标题 / Title |
| body | TEXT | nullable | 正文 / Body |
| type | VARCHAR(32) | default system | 类型（reminder/system/...） / Type (reminder/system/...) |
| targetType | VARCHAR(32) | nullable | 深链目标类型（event/conversation/todo，MS-5） / Deep-link target type (event/conversation/todo, MS-5) |
| targetId | VARCHAR(64) | nullable | 深链目标 ID（MS-5） / Deep-link target ID (MS-5) |
| isRead | BOOLEAN | default false | 是否已读 / Whether read |
| link | VARCHAR(255) | nullable | 可读链接文本 / Readable link text |
| createdAt / updatedAt | DATETIME | — | 时间戳 / Timestamps |

> 索引 `(userId, createdAt)`。`targetType/targetId` 为结构化深链字段（前端点击跳转以此为准），`link` 为可读文本（MS-5）。
> Index `(userId, createdAt)`. `targetType/targetId` are structured deep-link fields (used by the frontend for tap navigation), `link` is readable text (MS-5).

---

## 7. 安全架构 / 7. Security Architecture

### 7.1 认证安全 / 7.1 Authentication Security

| 规则 / Rule | 说明 / Description |
|------|------|
| 密码强度 / Password strength | 最少 8 位，必须包含字母和数字 / At least 8 characters, must contain letters and numbers |
| 哈希 / Hashing | bcrypt 12 轮 / bcrypt 12 rounds |
| 登录锁定 / Login lockout | 连续 10 次失败 → 锁定 15 分钟 / 10 consecutive failures → locked for 15 minutes |
| 登录限流 / Login rate limit | 设备级指数退避（2^N 秒，上限 300s） / Device-level exponential backoff (2^N seconds, cap 300s) |
| Token 轮换 / Token rotation | refresh token 每次使用后更新，旧 token 失效 / Refresh token is rotated after each use; the old token is invalidated |
| Token 存储 / Token storage | refresh token 存 SHA-256 哈希，非明文 / Refresh token stored as a SHA-256 hash, not plaintext |
| 防枚举 / Anti-enumeration | 用户不存在/密码错误返回相同提示 / Same response whether the user does not exist or the password is wrong |
| 防时序 / Anti-timing | 认证失败随机延迟 200-500ms / Random 200-500ms delay on auth failure |
| 会话清除 / Session clearing | refresh token 不匹配时清除所有会话 / Clears all sessions when the refresh token mismatches |

### 7.2 请求安全 / 7.2 Request Security

| 规则 / Rule | 说明 / Description |
|------|------|
| Body 限制 / Body limit | JSON body ≤ 1MB / JSON body ≤ 1MB |
| CORS | 生产环境设为具体域名白名单 / Production is set to a specific domain whitelist |
| Helmet | 安全头部自动注入 / Security headers auto-injected |
| Validation | class-validator whitelist（剔除多余字段） / class-validator whitelist (strips extra fields) |
| Sort 注入防护 / Sort injection protection | sort 参数白名单校验 / sort parameter whitelist validation |
| 路由守卫 / Route guards | 未认证自动重定向到登录页 / Unauthenticated users auto-redirect to the login page |

### 7.3 文件上传安全 / 7.3 File Upload Security

| 规则 / Rule | 说明 / Description |
|------|------|
| MIME 校验 / MIME validation | 白名单：jpg/png/gif/webp/pdf/zip / Whitelist: jpg/png/gif/webp/pdf/zip |
| 扩展名校验 / Extension validation | 与服务端 MIME 一致 / Matches the server-side MIME |
| 魔数校验 / Magic number validation | 读取文件头部字节验证真实格式 / Reads file header bytes to verify the real format |
| 大小限制 / Size limit | 最大 10MB / Max 10MB |
| 失败清理 / Failure cleanup | 魔数不匹配 → 自动删除文件 / Magic number mismatch → file auto-deleted |

### 7.4 AI 功能安全 / 7.4 AI Feature Security

| 规则 / Rule | 说明 / Description |
|------|------|
| 认证继承 / Auth inheritance | 所有 AI 端点继承 JwtAuthGuard / All AI endpoints inherit JwtAuthGuard |
| 数据隔离 / Data isolation | Tool 执行注入 userId，只查本人数据 / Tool execution injects userId, only queries own data |
| 对话隔离 / Conversation isolation | ConversationStore 以 userId 为 key 隔离 / ConversationStore isolated by userId as key |
| 限流 / Rate limiting | AI 端点单独限流（30 次/分钟） / AI endpoints rate-limited separately (30 requests/minute) |
| API Key | 仅从环境变量读取，不暴露给前端 / Read only from environment variables, never exposed to the frontend |
| Prompt 注入 / Prompt injection | System Prompt 定义边界 + 工具参数校验 / System Prompt defines boundaries + tool argument validation |

---

## 8. 部署架构 / 8. Deployment Architecture

### 8.1 环境配置层次 / 8.1 Environment Configuration Layers

```
.env                  # 默认（开发环境，SQLite）
.env.staging          # Staging（PostgreSQL）
.env.production       # 生产（PostgreSQL）
```

### 8.2 Docker 部署（生产） / 8.2 Docker Deployment (Production)

```
Nginx (HTTPS) → NestJS (API) → PostgreSQL
              → Flutter Web (静态文件)
```

### 8.3 可观测性栈 / 8.3 Observability Stack

通过 `docker-compose.observability.yml` 编排 Prometheus + Grafana + Jaeger + Loki：

Orchestrated via `docker-compose.observability.yml`: Prometheus + Grafana + Jaeger + Loki:

| 组件 / Component | 端口 / Port | 说明 / Description |
|------|------|------|
| Prometheus | 9090 | 抓取 `server:3000/api/v1/metrics`；evaluation 15s / Scrapes `server:3000/api/v1/metrics`; evaluation 15s |
| Grafana | 3001 | 预置 Prometheus + Loki 数据源 + HTTP dashboard（匿名）；Alerting 查看告警规则 / Pre-provisioned Prometheus + Loki datasources + HTTP dashboard (anonymous); Alerting to view alert rules |
| Jaeger | 16686 (UI) / 4318 (OTLP) | 接收 server 的 OpenTelemetry traces / Receives the server's OpenTelemetry traces |
| Loki | 3100 | 接收 pino 直推的 JSON 日志 / Receives JSON logs pushed directly by pino |

**告警规则**（`infra/observability/prometheus/rules/server-alerts.yml`）：ServerDown（critical，server 不可达 1m）、高错误率（5xx > 10% 持续 5m）、高延迟（P95 > 1s 持续 5m）、高并发（在途 > 100 持续 5m）。Prometheus 数据源启用 `manageAlerts`，Grafana Alerting 页面可见。

**Alert rules / 告警规则** (`infra/observability/prometheus/rules/server-alerts.yml`): ServerDown (critical, server unreachable for 1m), high error rate (5xx > 10% for 5m), high latency (P95 > 1s for 5m), high concurrency (in-flight > 100 for 5m). The Prometheus datasource enables `manageAlerts`, visible on the Grafana Alerting page.

**日志直推**：pino 通过 `pino-loki` transport 把 JSON 日志推给 Loki。`LOKI_ENABLED=true` 时启用（默认关闭）；dev 环境 pino-pretty 与 Loki 并存，生产只 Loki。标签 `app=keelbase-server`、`env=<NODE_ENV>`。

**Log shipping / 日志直推**: pino pushes JSON logs to Loki via the `pino-loki` transport, enabled with `LOKI_ENABLED=true` (off by default); in dev, pino-pretty and Loki coexist, while in production only Loki is used. Labels `app=keelbase-server`, `env=<NODE_ENV>`.

**本地开发**（server 在宿主机）：`docker compose -f docker-compose.observability.yml up -d`，Prometheus 用 `host.docker.internal:3000` 抓取；server 启动需 `OTEL_ENABLED=true OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 LOKI_ENABLED=true LOKI_URL=http://localhost:3100`。

**Local development / 本地开发** (server on the host machine): `docker compose -f docker-compose.observability.yml up -d`; Prometheus scrapes using `host.docker.internal:3000`; the server must start with `OTEL_ENABLED=true OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 LOKI_ENABLED=true LOKI_URL=http://localhost:3100`.

**完整编排**（server 在容器）：`docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --build`，并把 `infra/observability/prometheus/prometheus.yml` 的 targets 改回 `server:3000`，server 叠加 `OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318`、`LOKI_URL=http://loki:3100`。

**Full orchestration / 完整编排** (server in a container): `docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --build`, and change the targets in `infra/observability/prometheus/prometheus.yml` back to `server:3000`; the server additionally gets `OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318`, `LOKI_URL=http://loki:3100`.

> 注意：OTel 必须通过 `import './tracing-init'` 作为 main.ts 第一个 import 生效（副作用自执行），否则 auto-instrumentation 在 http/express 加载后才 patch，trace 无法捕获。
> Note: OTel must take effect via `import './tracing-init'` as the first import in main.ts (a self-executing side effect); otherwise auto-instrumentation patches only after http/express are loaded and traces cannot be captured.

### 8.4 迁移策略 / 8.4 Migration Strategy

```
开发环境： synchronize: true（自动同步）
生产环境： synchronize: false, migrationsRun: true（手动迁移）
```

---

## 9. AI Agent 架构 / 9. AI Agent Architecture

### 9.1 整体架构 / 9.1 Overall Architecture

```
用户 → AiController → AiService → ProviderFactory → LLM API
                                    ↓
                              ToolRegistry → EventsService / UsersService
                                    ↓
                              ConversationService（内存 Map + TTL）
```

### 9.2 Provider 工厂（多 LLM 可插拔） / 9.2 Provider Factory (Pluggable Multi-LLM)

```
LlmProviderFactory
├── register('deepseek', { baseURL: 'https://api.deepseek.com' })
│   └── OpenAICompatibleProvider（复用）
├── register('qwen', { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' })
│   └── OpenAICompatibleProvider（复用）
└── register('openai', { baseURL: 'https://api.openai.com/v1' })
    └── OpenAICompatibleProvider（复用）
```

### 9.3 工具调用流程 / 9.3 Tool Calling Flow

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

### 9.4 模型路由 / 9.4 Model Routing

| 场景 / Scenario | 模型 / Model | 策略 / Strategy |
|------|------|------|
| 日常对话 / Daily chat | deepseek-v4-flash | 默认，快速响应 / Default, fast responses |
| 数据洞察 / Data insights | qwen-max | 中文理解最优 / Best Chinese understanding |
| Fallback | deepseek → qwen → openai | 自动降级 / Auto fallback |

---

## 10. 环境变量总表 / 10. Environment Variables Reference

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
DB_READ_REPLICAS=             # 读写分离：逗号分隔只读副本 "host1:5432,host2:5432"，空=单库
DB_PATH=./data/front.sqlite

# 连接池
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=2000

# 全局限流（默认 60 次/分钟；压测/大促可放宽）
THROTTLE_LIMIT=60
THROTTLE_TTL=60000

# 安全
LOCKOUT_THRESHOLD=10
LOCKOUT_DURATION=15
ENCRYPTION_KEY=                   # 敏感数据加密密钥（32 字节 hex，必填）
ENCRYPTION_HMAC_KEY=              # providerHash 派生密钥（缺省回退 ENCRYPTION_KEY）

# OAuth 第三方登录
OAUTH_ENABLED_PROVIDERS=wechat,alipay,qq   # 逗号分隔（可加 google,apple,oidc）
OAUTH_REDIRECT_BASE=              # OAuth 回跳基址（空则用请求 host）
GOOGLE_CLIENT_ID=
APPLE_CLIENT_ID=
WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_REMIND_TEMPLATE_ID=        # MINI-2 微信订阅消息：事件提醒模板 ID（空则不发送）
ALIPAY_APP_ID=
ALIPAY_PUBLIC_KEY=                # 支付宝公钥（验证支付宝响应）
ALIPAY_PRIVATE_KEY=               # 支付宝应用私钥（签名请求）
QQ_APP_ID=
QQ_APP_KEY=

# 企业 SSO（P2-4 通用 OIDC）：配齐 issuer/client_id/secret 后 /auth/oauth/providers 出现 oidc（enterprise 组）
OIDC_ENABLED=false
OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=

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
SMTP_FROM=KeelBase <no-reply@example.com>
APP_BASE_URL=http://localhost:8080

# 短信服务
SMS_DRIVER=console                 # console（本地） | aliyun | none

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

# 备份保留份数（npm run backup 轮转用）
BACKUP_KEEP=7

# 特性开关（PL-8/EASY-3）：未配置由 APP_PRESET 判定（默认 full 全开）；关闭后对应接口返回 404
APP_PRESET=full                   # full（全开）| small（关外部集成）| lite（最小可用）
FEATURE_AI_ENABLED=true
FEATURE_SEARCH_ENABLED=true
FEATURE_PUSH_ENABLED=true
FEATURE_SMS_ENABLED=true
FEATURE_OAUTH_ENABLED=true
FEATURE_UPLOAD_ENABLED=true
FEATURE_NOTIFICATIONS_ENABLED=true
FEATURE_TODOS_ENABLED=true

# 上传访问控制（CR-21）：=1 时强制校验签名 URL（渐进模式默认放行裸 URL）
UPLOAD_REQUIRE_SIGN=false

# 定时任务（PL-7）：已读通知保留天数，超期由定时清理
NOTIFICATION_RETENTION_DAYS=30

# Headless API（AI-19，可选）：第三方集成用 API Key（x-api-key 头校验；留空则 /headless 端点 401）
HEADLESS_API_KEY=

# 联网搜索（AI-14）
TAVILY_API_KEY=
TAVILY_BASE_URL=https://api.tavily.com/search

# 私有化 AI（POV-1）：配置 OLLAMA_BASE_URL 后自动注册 ollama provider（无 API Key，数据不出域）
OLLAMA_BASE_URL=
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_EMBED_MODEL=bge-m3

# 异常告警 Webhook（RG-4）：5xx 自动推送群机器人（钉钉/飞书/Slack），防抖 60s
ALERT_WEBHOOK_ENABLED=false
ALERT_WEBHOOK_URL=
ALERT_WEBHOOK_TYPE=dingtalk       # dingtalk | feishu | slack
ALERT_WEBHOOK_MIN_INTERVAL_SECONDS=60

# AI Provider（deepseek | qwen | openai；配置 OLLAMA_BASE_URL 后可选 ollama）
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

## 11. Front-Taro（主 App H5/小程序端） / 11. Front-Taro (Main App H5 / Mini-Program)

主 App 的 H5/小程序渠道。分层：`services/`（API 封装）+ `stores/`（zustand）+ `pages/*/index.tsx`。已实现功能（PL-6 同步自 Flutter）：

The H5/mini-program channel of the main App. Layered as: `services/` (API wrappers) + `stores/` (zustand) + `pages/*/index.tsx`. Features implemented (PL-6, synced from Flutter):

| 功能 / Feature | 页面 / Page | 说明 / Description |
|------|------|------|
| 认证/事件/上传/用户/探索/设置 / Auth/events/upload/users/explore/settings | splash/login/register/dashboard/events/event-form/upload/users/explore/settings | 基础功能 / Basic features |
| 通知中心 / Notification center | `/pages/notifications/index` | 列表/未读/已读/全部已读/删除（分页轮询，SSE 在 H5 支持有限） / List/unread/read/read-all/delete (paginated polling; SSE has limited H5 support) |
| 会话管理 / Session management | `/pages/sessions/index` | 设备列表/当前设备标记/远程登出 / Device list / current-device marking / remote logout |

`api-client.ts` 支持 GET/POST/PUT/PATCH/DELETE，统一附带 `x-device-id` 头（后端识别当前设备标记会话 isCurrent）。

`api-client.ts` supports GET/POST/PUT/PATCH/DELETE, always attaching the `x-device-id` header (the backend identifies the current device to mark a session isCurrent).

> 渠道策略：AI 对话 / 全局搜索 / 待办清单为 Flutter 重交互能力，H5 小程序轻量渠道按需再同步。
> Channel strategy: AI chat / global search / todo list are Flutter-heavy-interaction features; the lightweight H5 mini-program channel syncs them on demand.

---

## 12. 管理员管理台（Web-Admin-Vue） / 12. Admin Console (Web-Admin-Vue)

Web 端宿主（Vue3 + Element Plus）：企业用户工作台与管理员控制台同一壳，管理功能只在控制台侧。

Enterprise web host (Vue3 + Element Plus): workbench and admin console share one shell; admin features live only on the console side.

| 项 / Item | 说明 / Description |
|------|------|
| 技术栈 / Tech stack | Vue3 + Vite + TS + Element Plus + Pinia + vue-i18n / Vue3 + Vite + TS + Element Plus + Pinia + vue-i18n |
| 构建 / Build | `npm run build` → `dist/`（base=/admin/） / `npm run build` → `dist/` (base=/admin/) |
| 部署 / Deployment | 独立域名（建议 `admin.example.com`），与主 app 分离；hash 路由 / Standalone domain (suggested `admin.example.com`), separated from the main app; hash routing |
| 认证 / Auth | 独立登录 → `GET /auth/me` 校验 `role === 'admin'`，非管理员拒绝 / Standalone login → `GET /auth/me` checks `role === 'admin'`, non-admins rejected |
| 授权 / Authorization | 全部管理 API 依赖后端 CASL `@CheckPolicies((a) => a.can('manage', 'all'))` / All admin APIs rely on backend CASL `@CheckPolicies((a) => a.can('manage', 'all'))` |

**模块清单**： / **Module list**:

| 页面 / Page | 功能 / Feature | 依赖 API / Depends on API |
|------|------|---------|
| 登录 / Login | 管理员登录（无注册入口） / Admin login (no registration entry) | POST /auth/login |
| 概览 / Overview | 平台数据 + AI 用量 + 趋势 + 操作分布 / Platform data + AI usage + trends + operation distribution | GET /admin/overview、GET /audit/stats |
| 用户管理 / User management | 分页/搜索、角色切换、删除、详情 / Pagination/search, role switch, delete, details | GET /users、PATCH /users/:id/role、DELETE /users/:id |
| 事件管理 / Event management | 全量事件分页、筛选、删除 / Full event pagination, filter, delete | GET /events/admin/all、DELETE /events/admin/:id |
| 知识库 / Knowledge base | 条目 CRUD + 文档上传 / Entry CRUD + document upload | /ai/knowledge* |
| 通知广播 / Notification broadcast | 全体/指定用户广播 / Broadcast to all / specified users | POST /admin/notifications/broadcast |
| 监控中心 / Monitoring center | 健康/依赖/指标/数据规模（15s 轮询） / Health/dependencies/metrics/data scale (15s polling) | GET /admin/monitor/summary |
| AI 审计 / 操作审计 / AI audit / operation audit | 日志 + 统计 + CSV 导出 / Logs + stats + CSV export | /audit/*、/audit/operations/* |
| 会话管理 / Session management | 在线会话 + 强制下线 / Online sessions + force logout | GET/DELETE /admin/sessions* |
| 回收站 / Trash | 软删事件/待办恢复 / Restore soft-deleted events/todos | GET /admin/trash、POST /admin/trash/:type/:id/restore |
| 数据导入 / Data import | 用户/事件 CSV 批量导入 / CSV bulk import of users/events | POST /admin/import/* |
| 模板市场 / Template marketplace | 内置示例模板一键导入 / One-click import of built-in example templates | GET /admin/templates、POST /admin/templates/:id/import |
| AI 评测 / AI evaluation | 用例 CRUD + 跑批 + 报告 / Case CRUD + batch run + report | /ai/eval/* |
| 工具与副作用 / Tools & side effects | AI 工具清单 + 副作用撤销 / AI tool list + side-effect undo | /ai/tools、/ai/tool-effects* |
| 平台统计 / Platform statistics | DAU/WAU/MAU/留存/功能漏斗/错误 / DAU/WAU/MAU/retention/feature funnel/errors | GET /admin/analytics |
| 系统 AI 助手 / System AI Assistant | 平台能力 Explain/Guide/Navigate 对话，可跳转管理台页 / Platform explain/guide/navigate chat; navigates console pages | POST /admin/ai/chat |

**安全设计**： / **Security design**:
- 主 app 不打包/不引用任何管理页面（管理入口已从 Front-Taro 移除）
  The main app does not bundle or reference any admin pages (the admin entry has been removed from Front-Taro)
- 管理台前端仅做 UI 与角色校验；真正的越权防护在后端 CASL（普通用户 token 调管理 API 返回 403）
  The admin frontend only performs UI and role checks; the real privilege enforcement is in backend CASL (a regular user token calling admin APIs returns 403)
- 部署加固（独立域名/IP 白名单/MFA）见 roadmap D.1，属运维项
  Deployment hardening (standalone domain / IP whitelist / MFA) per roadmap D.1, an operations concern

---

## 13. 通用模式 / 13. Common Patterns

### 12.1 前端：添加新功能 / 12.1 Frontend: Adding a New Feature

```
1. features/<name>/{data,domain,presentation}
2. Model + Repository + RemoteDataSource + Provider + Page + Widget
3. i18n 字符串
4. 路由注册
5. Provider 注册到 main.dart
```

### 12.2 后端：添加新 CRUD 模块 / 12.2 Backend: Adding a New CRUD Module

```
1. nest g module features/xxx
2. nest g service features/xxx
3. nest g controller features/xxx
4. 创建 entity + dto
5. TypeOrmModule.forFeature → module imports
6. 注册到 app.module.ts
```

### 12.3 修改功能（文档先行） / 12.3 Modifying a Feature (Docs First)

```
1. 更新 docs/{feature}-requirements.md（业务变化）
2. 更新 docs/{feature}.spec.md（接口/数据/规则变化）
3. 修改代码
4. 更新测试
```

---

## 14. 命令速查 / 14. Command Cheat Sheet

### 后端 / Backend

| 命令 / Command | 说明 / Description |
|------|------|
| npm run start:dev | 开发启动（热重载） / Dev startup (hot reload) |
| npm run build | 编译 / Compile |
| npm test | 单元测试 / Unit tests |
| npm run test:e2e | 端到端测试 / End-to-end tests |
| npm run test:cov | 测试覆盖率 / Test coverage |
| npm run migration:generate | 生成迁移文件 / Generate migration file |
| npm run migration:run | 执行迁移 / Run migrations |

### 前端 / Frontend

| 命令 / Command | 说明 / Description |
|------|------|
| flutter run | 运行（设备/模拟器） / Run (device/emulator) |
| flutter run -d chrome | Web 运行 / Web run |
| flutter test | 测试 / Tests |
| flutter analyze | 静态分析 / Static analysis |

### Docker / Docker

| 命令 / Command | 说明 / Description |
|------|------|
| docker compose up --build | 开发构建启动 / Dev build & start |
| docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d | 生产启动 / Production startup |
