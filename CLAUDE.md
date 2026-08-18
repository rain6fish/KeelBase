# Front Flutter — Full-Stack Base Platform AI Development Guide

> 本项目是一个 **AI 驱动的企业应用工程体系**基座——让 AI 按系统约定快速生成带安全、三端可用的企业应用，以此为基座可快速开发新的全栈应用。
> 定位（Roadmap V2 战略三角）：**Build → Run → Trust → Private Deploy**——
> ① **Build 开发期 AI**：Application Protocol 协议化配置 → AI 生成业务模块（entity/DTO/API/页面/权限/审计）；系统只提供约定，AI 负责生成，**不做内建低代码/代码生成器**；
> ② **Run 运行时 AI**：业务安全的 Agent harness——Agent 工具调用限定用户数据范围、写操作需人工确认、CASL 行级权限 + 全链路审计；
> ③ **Trust / Private Deploy**：数据主权与私有化部署，AI 全程可审计、可撤销。
> 写代码之前，请先阅读此文件了解架构、约定和安全规则。

> 致谢：本项目由 Claude Code（Anthropic）协助开发，架构设计、代码实现与文档均有 Claude 的贡献。

---

## 1. 技术栈总览

| 层 | 技术 | 说明 |
|----|------|------|
| 前端框架 | Flutter 3.x + Material 3 | iOS / Android / Web 三端 |
| 状态管理 | Provider (ChangeNotifier) | 轻量、官方推荐 |
| 网络层 | Dio | HTTP 客户端，含 JWT 拦截器 + 自动刷新 |
| 路由 | GoRouter | 声明式路由 + 重定向守卫 |
| 持久化 | SharedPreferences + flutter_secure_storage | 主题偏好 + Token 安全存储 |
| 后端框架 | NestJS 11.x + TypeScript | 模块化、装饰器驱动 |
| ORM | TypeORM | 支持 SQLite (dev) / PostgreSQL (prod) |
| 认证 | JWT (access + refresh token) | 轮换策略 + SHA-256 哈希存储 |
| 校验 | class-validator + Joi | DTO + 环境变量双重校验 |
| 日志 | pino (nestjs-pino) | 结构化 JSON 日志，dev 用 pino-pretty |
| 可观测性 | Prometheus + OpenTelemetry | /metrics 指标端点 + OTLP 链路追踪 |
| API 文档 | Swagger (OpenAPI) | 开发环境自动生成 |
| 容器化 | Docker + Nginx | 生产部署 |

---

## 2. 项目结构

```
KeelBase/
├── Front-Flutter/                 # Flutter 前端
│   ├── lib/
│   │   ├── main.dart              # 入口：依赖注入 + MultiProvider
│   │   ├── app.dart               # App widget：主题 + 路由 + i18n
│   │   ├── core/
│   │   │   ├── api/               # ApiClient (Dio 封装) + ApiResponse
│   │   │   ├── config/            # AppConfig (环境配置加载)
│   │   │   ├── constants/         # 全局常量
│   │   │   ├── errors/            # 异常类型定义
│   │   │   ├── i18n/              # AppLocalizations (zh/en) 国际化
│   │   │   ├── router/            # GoRouter 配置 + 路由守卫
│   │   │   ├── security/          # SecureStorageService (Token 安全存储)
│   │   │   ├── services/          # 主题、连接检测、缓存、分析、日志、Token刷新
│   │   │   ├── theme/             # AppTheme + 深浅色主题
│   │   │   ├── time/              # TimeProvider (可测试的时间抽象)
│   │   │   ├── utils/             # validators 等工具
│   │   │   └── widgets/           # AppShell, Loading, ErrorView, EmptyView, Toast, Skeleton, FormField, PaginatedList
│   │   └── features/              # 功能模块（每个功能独立文件夹，Clean Architecture）
│   │       ├── auth/              # 登录/注册 (data/domain/presentation)
│   │       ├── dashboard/         # 首页概览
│   │       ├── events/            # 日历事件列表 + 表单 (data/domain/presentation)
│   │       ├── explore/           # 发现页（快捷入口）
│   │       ├── legal/             # 隐私政策 + 服务条款
│   │       ├── profile/           # 个人中心
│   │       ├── settings/          # 设置页（主题、语言、版本）
│   │       ├── splash/            # 启动页（自动登录检测）
│   │       ├── upload/            # 文件上传 (data/domain/presentation)
│   │       └── users/             # 用户列表/详情 (data/domain/presentation)
│   └── test/                      # Flutter 测试
│
├── Server-NestJS/                 # NestJS 后端
│   ├── src/
│   │   ├── main.ts                # 启动：OTel 初始化 → Nest → pino → Swagger
│   │   ├── app.module.ts          # 根模块：Config、TypeORM、Throttler、Logger、全局守卫
│   │   ├── config/                # env.config.ts (Joi schema) + logging.ts (pino) + typeorm-data-source.ts
│   │   ├── common/
│   │   │   ├── entities/          # 共享实体 (User)
│   │   │   ├── dto/               # 通用 DTO (PaginationDto)
│   │   │   ├── casl/              # CASL 授权：CaslAbilityFactory + PoliciesGuard + @CheckPolicies/@CurrentAbility
│   │   │   ├── decorators/        # Raw() 等自定义装饰器
│   │   │   ├── filters/           # AllExceptionsFilter (全局异常)
│   │   │   ├── interceptors/      # ResponseInterceptor (统一响应包装，@Raw() 跳过)
│   │   │   ├── interfaces/        # ApiResponse 接口
│   │   │   └── utils/             # file-validator.ts (魔数校验)
│   │   ├── auth/                  # 认证模块 (JWT + bcrypt + 登录锁定 + Token轮换)
│   │   ├── users/                 # 用户模块 (CRUD + 分页 + CASL + 所有权校验)
│   │   ├── events/                # 日历事件模块 (CRUD + 范围查询 + CASL + 所有权校验)
│   │   ├── health/                # 健康检查
│   │   ├── metrics/               # Prometheus 指标（service + middleware + controller）
│   │   ├── upload/                # 文件上传（MIME + 魔数 + 扩展名校验）
│   │   └── tracing.ts             # OpenTelemetry 初始化
│   ├── test/                      # E2E 测试
│   ├── migrations/                # TypeORM 迁移文件
│   ├── uploads/                   # 上传文件目录
│   └── data/                      # SQLite 数据文件
│
├── Front-Taro/                    # 主 app 的 Taro H5/小程序前端（不含管理功能）
├── Web-Admin-Vue/                     # 独立管理员管理台（Vue3 + Vuetify3 PC Web，独立构建/部署）
│
├── .github/
│   ├── workflows/ci.yml           # CI（GitHub Actions，push 到 GitHub main 自动触发）
│   └── dependabot.yml             # 自动依赖更新 (npm + pub + docker)
├── docker-compose.yml             # 容器编排 (PostgreSQL + NestJS + Nginx)
├── docker-compose.prod.yml        # 生产覆盖 (HTTPS + TLS 证书)
├── Dockerfile                     # 多阶段构建 (NestJS + Flutter web + Nginx)
├── nginx.conf                     # Nginx 开发配置 + 安全头部
├── nginx.https.conf               # Nginx 生产 HTTPS 配置
├── task_plan.md                   # 当前任务的执行计划
└── CLAUDE.md                      # ← 你正在看这个
```

---

## 3. 前端架构与规范

### 3.1 数据流

```
用户操作 → Provider 方法 → Repository 接口 → Remote DataSource → Dio/ApiClient → API 响应 → Model → notifyListeners() → UI 重建
```

- **Provider**: 持有状态+业务逻辑，调用 Repository
- **Repository**: 抽象数据源，通过构造函数注入（无 Fake，直接连接 API）
- **RemoteDataSource**: 封装具体的 HTTP 调用逻辑
- **Model**: 纯 Dart 类（含 `fromJson`/`toJson`）
- **Screen**: StatelessWidget + context.watch\<X\>()
- **Widget**: 哑组件，通过构造函数或 Provider 接收数据

### 3.2 添加新功能的步骤（Clean Architecture 模式）

```
1. 创建文件夹结构: features/<name>/{data,domain,presentation}
2. 定义 Model → features/<name>/data/models/xxx_model.dart
3. 定义 Repository 接口 → features/<name>/domain/repositories/xxx_repository.dart
4. 创建 RemoteDataSource → features/<name>/data/datasources/xxx_remote_datasource.dart
5. 创建 Repository 实现 → features/<name>/data/repositories/xxx_repository_impl.dart
6. 创建 Provider → features/<name>/presentation/providers/xxx_provider.dart
7. 创建 UI → features/<name>/presentation/pages/xxx_page.dart
8. 在 main.dart 注册 Repository + Provider
9. 在 core/i18n/app_localizations.dart 添加 i18n 字符串
10. 在 core/router/app_router.dart 添加路由
```

### 3.3 i18n 规则

所有用户可见文本必须通过 AppLocalizations：

```dart
// 定义（在 AppLocalizations 类中）
String get myLabel => _t('English', '中文');

// 使用（context.l10n 扩展方法）
Text(context.l10n.myLabel)

// 带参数的形式（定义成 getter 返回方法）
String get welcomeTo => (String name) => _t('Welcome to $name', '欢迎来到$name');
// 使用
Text(context.l10n.welcomeTo('KeelBase'))
```

### 3.4 主题规则

```dart
// ✅ 正确：使用 AppTheme
ThemeData light = AppTheme.lightTheme;
ThemeData dark  = AppTheme.darkTheme;

// ✅ 获取主题色
context.colorScheme.primary   // 主色
context.colorScheme.onSurface // 文本色

// ❌ 不要：硬编码颜色值
```

### 3.5 网络层

```dart
// API 调用（自动携带 JWT token）
final res = await ApiClient().get('/events', queryParameters: {...});
final res = await ApiClient().post('/auth/login', data: {...});

// Token 自动刷新：Dio 拦截器自动处理 401 → 调用 /auth/refresh → 重试
// 若 refresh 失败 → onAuthFailure 回调 → authProvider.logout() → 跳转登录
```

### 3.6 文件组织规则

- 每个新功能一个文件夹 `features/<name>/`
- 功能内使用 Clean Architecture 分层：`data/`, `domain/`, `presentation/`
- 禁止在 `core/` 放功能逻辑
- 文件名: `snake_case.dart` | 类名: `PascalCase` | 变量: `camelCase`

### 3.7 通用组件

| 组件 | 用途 |
|------|------|
| `LoadingWidget(message?)` | 居中加载指示器 |
| `AppErrorView(message, actionLabel?, onRetry?)` | 错误页面 + 重试按钮 |
| `AppEmptyView(icon?, message, actionLabel?, onAction?)` | 空状态页面 |
| `AppToast.show/success/error(context, msg)` | Toast 通知 |
| `AppSkeleton` | 骨架屏加载效果 |
| `AppFormField` | 表单输入组件 |
| `PaginatedListView` | 分页列表组件 |

### 3.8 底部导航

AppShell 提供 5 个底部 Tab（含 More 按钮共 6 槽位）：
1. **Home** (`/dashboard`) — 首页概览
2. **Events** (`/events`) — 日历事件
3. **More** — 更多菜单
4. **Explore** (`/explore`) — 发现页
5. **AI** (`/ai`) — AI 对话
6. **Todos** (`/todos`) — 待办清单

---

## 4. 后端架构与规范

### 4.1 模块结构

每个功能模块遵循：
```
feature/
├── feature.module.ts      # 引入 TypeOrm.forFeature + Controller + Service
├── feature.controller.ts   # @Controller + 路由 + Swagger 装饰器
├── feature.service.ts      # 业务逻辑
├── feature.entity.ts       # TypeORM 实体
└── dto/
    ├── create-feature.dto.ts
    └── update-feature.dto.ts
```

### 4.2 API 设计规范

```
URL 格式: /api/v1/{resources}   （仅名词复数，禁止动词）
方法语义: GET=查询  POST=创建  PUT=全量更新  DELETE=删除
分页:     ?page=1&limit=20&sort=createdAt&order=desc
```

**统一响应结构**（所有接口必须返回此格式）：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {},
  "timestamp": "2026-07-24T09:12:55Z"
}
```

**跨语言序列化规则**：

| 规则 | 说明 |
|------|------|
| 字段命名 | 统一 camelCase |
| 时间格式 | ISO 8601 字符串 |
| 布尔字段 | 禁止 `is_` 前缀 |
| 空值 | 使用 `null` 而非空字符串 |

### 4.3 权限控制

```typescript
// 所有 Controller 默认需要 JWT 认证（全局 JwtAuthGuard）
// 公开端点加 @Public() 装饰器
@Public()
@Post('login')
async login(@Body() dto: LoginDto) { ... }

// 获取当前用户
@Get('me')
async profile(@CurrentUser() user: JwtPayload) { ... }
```

**CASL 授权**（全局 PoliciesGuard，在 JwtAuthGuard 之后执行）：

```typescript
// 仅管理员可访问的端点（路由级策略）
@CheckPolicies((ability) => ability.can('manage', 'all'))
@Get()
async findAll(...) { ... }

// 行级校验（服务层/控制器用 @CurrentAbility() 取能力）
@Get(':id')
async findOne(@Param('id') id: number, @CurrentAbility() ability: AppAbility) {
  if (ability.cannot('read', subject('Event', event))) {
    throw new ForbiddenException('无权访问');
  }
}
```

**能力规则**（`CaslAbilityFactory`，`src/common/casl/`）：
- `admin` → `can('manage', 'all')`（管理一切资源）
- `user` → `can('manage', 'User', { id: user.sub })`、`can('manage', 'Event', { userId: user.sub })`
- `UserRole` 枚举：`user`（默认）/ `admin`，存于 User 实体 `role` 列
- JWT access token payload 包含 `role` 字段

**所有权规则**：
- Users: 本人或管理员可查看/更新/删除（`@CheckPolicies` + ability 条件）
- Events: 本人或管理员可访问（`userId === user.sub`）
- 实例校验通过 `subject('User'|'Event', obj)` 提供 subject 名

### 4.4 速率限制

- 全局：60 次/分钟
- `POST /auth/login`：10 次/分钟
- `POST /auth/register`：3 次/分钟
- `GET /health`：60 次/分钟（`?detail=true` 时同样限流，防依赖故障占满 DB 连接池）

### 4.5 文件上传

```typescript
// POST /api/v1/upload
// Content-Type: multipart/form-data
// 支持格式: jpg, png, gif, webp, pdf, zip
// 最大: 10MB
// 安全校验: MIME type + 扩展名白名单 + 魔数头部验证
```

返回值：
```json
{
  "url": "/uploads/123456789-file.jpg",
  "filename": "123456789-file.jpg",
  "originalName": "photo.jpg",
  "size": 102400,
  "mimeType": "image/jpeg"
}
```

---

## 5. 安全规则（必须遵守）

### 5.1 认证安全

| 规则 | 说明 |
|------|------|
| 密码 | 最少 8 位，必须包含字母和数字，bcrypt 12 轮 |
| 登录锁定 | 连续 10 次失败 → 锁定 15 分钟 |
| Token 轮换 | refresh token 每次使用后更新，旧 token 立即失效 |
| Token 存储 | refresh token 存 SHA-256 哈希，非明文 |
| 防枚举 | 用户不存在/密码错误返回相同提示 |
| 防时序 | 认证失败随机延迟 200-500ms |
| 会话清除 | refresh token 不匹配时清除所有会话 |
| 静态加密 | phone / providerId 用 AES-256-GCM 加密存储；providerId 用 HMAC-SHA256 派生 providerHash 供查询 |

### 5.2 请求安全

| 规则 | 说明 |
|------|------|
| Body 限制 | JSON body ≤ 1MB |
| CORS | 生产环境设为具体域名白名单 |
| Helmet | 安全头部自动注入 |
| Validation | class-validator whitelist（剔除多余字段）|
| Sort 注入防护 | sort 参数白名单校验 |
| 路由守卫 | 未认证自动重定向到登录页 |

### 5.3 文件上传安全

| 规则 | 说明 |
|------|------|
| MIME 校验 | 客户端声明的 MIME type 白名单 |
| 扩展名校验 | 文件名扩展名白名单 |
| 魔数校验 | 读取文件头部字节验证真实格式 |
| 大小限制 | 最大 10MB |
| 失败清理 | 魔数不匹配 → 拒绝上传（memoryStorage 无磁盘残留） |
| 图片处理 | 光栅图（jpeg/png/webp）统一转 WebP（质量 80）+ 宽度上限 1280；gif/pdf/zip 原样 |

### 5.4 部署安全

| 规则 | 说明 |
|------|------|
| Docker | 非 root 用户运行 |
| Swagger | 仅开发环境可用 |
| HSTS | 生产环境启用 HTTPS + HSTS |
| 生产模式 | synchronize: false, migrationsRun: true |

---

## 5.5 产品架构红线（必须遵守）

**全平台只有三个入口：主 App（Front-Flutter）/ 小程序（Front-Taro）/ 管理端（Web-Admin-Vue）。**

1. **所有后台管理功能一律并入管理端**，包括但不限于：用户与权限管理、事件/内容管理、监控审计、会话管理、知识库维护、通知广播、系统信息。**禁止**在主 App 或小程序中实现任何面向管理员的 CRUD/权限/审计功能。
2. **管理页面不出现用户填写的个人数据 / 隐私数据**；必须出现时用掩码遮盖：
   - `/users` 等管理端接口在服务端完成脱敏（`sanitizeForAdmin`）：email/phone 掩码，bio/生日/名姓/头像等字段不返回。
   - 审计日志 `requestBody` 中的敏感字段（password/token 等）自动打码（`redactSensitive`）。
   - 主 App 本人路径（`/auth/me`）可返回本人明文，仅管理端接口脱敏。
3. **管理端必须支持双语（中文/英文）**：所有文案走 `src/i18n/`（zh/en + 跟随系统语言 + 顶部切换器），禁止硬编码中文。
4. **审计必须显示用户名 + 功能实际名称**：操作审计/AI 审计列表左联用户表带出 `username`；功能名由 `feature-map.ts` 生成语义 key，前端按语言渲染。

---

## 6. 环境配置

### 6.1 环境变量

```bash
# 核心变量（必填）
JWT_SECRET=           # 最少 32 字符
JWT_REFRESH_SECRET=   # 最少 32 字符

# 环境切换
NODE_ENV=development  # development | staging | production
DB_TYPE=sqlite        # sqlite (dev) | postgres (prod)
CORS_ORIGINS=*        # 生产环境改为 https://yourdomain.com

# 安全
LOCKOUT_THRESHOLD=10  # 登录锁定的失败次数阈值
LOCKOUT_DURATION=15   # 锁定时间（分钟）
ENCRYPTION_KEY=       # 敏感数据加密密钥，32 字节 hex（openssl rand -hex 32）
ENCRYPTION_HMAC_KEY=  # providerHash 派生密钥，32 字节 hex（缺省回退用 ENCRYPTION_KEY）

# 可观测性
LOG_LEVEL=info                 # fatal | error | warn | info | debug | trace
OTEL_ENABLED=false             # 是否启用 OpenTelemetry 链路追踪
OTEL_EXPORTER_OTLP_ENDPOINT=   # OTLP 收集器地址，默认 http://localhost:4318
LOKI_ENABLED=false             # 是否把 pino 日志直推 Loki
LOKI_URL=                      # Loki 地址，默认 http://localhost:3100

# OAuth 第三方登录
OAUTH_ENABLED_PROVIDERS=wechat,alipay     # 启用的认证商（逗号分隔，默认国内）
WECHAT_APP_ID=           # 微信开放平台 AppID
WECHAT_APP_SECRET=       # 微信开放平台 AppSecret
WECHAT_REMIND_TEMPLATE_ID=  # MINI-2 微信订阅消息：事件提醒模板 ID（空则不发送；前端构建时 TARO_APP_WX_TEMPLATE_ID 需与此一致）
ALIPAY_APP_ID=           # 支付宝开放平台 AppID
ALIPAY_PRIVATE_KEY=      # 支付宝应用私钥（用于签名）
GOOGLE_CLIENT_ID=        # Google OAuth Web client ID（国际，如需加）
APPLE_CLIENT_ID=         # Apple Service ID（国际，如需加）

# 邮件服务（SMTP）
MAIL_ENABLED=false       # 是否启用邮件发送（nodemailer）
SMTP_HOST=               # SMTP 服务器地址
SMTP_PORT=465            # 465=SSL / 587=STARTTLS
SMTP_SECURE=true         # 是否使用 TLS
SMTP_USER=               # 发件账号
SMTP_PASS=               # 发件密码
SMTP_FROM=               # 发件人，如 "KeelBase <no-reply@example.com>"
APP_BASE_URL=http://localhost:8080  # 前端地址，拼密码重置链接用

# 对象存储
STORAGE_DRIVER=local     # local（本地磁盘）| s3（S3/MinIO/OSS 兼容）
S3_ENDPOINT=             # 本地 MinIO 时填 http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_PUBLIC_URL=           # 可选，对象公网前缀；留空用 bucket URL

# 推送通知
PUSH_DRIVER=none         # none（降级）| jpush（极光，国内；fcm/apns 预留）
JPUSH_APP_KEY=           # 极光应用标识
JPUSH_MASTER_SECRET=     # 极光服务端密钥（仅服务端保存）

# Redis 缓存
REDIS_URL=redis://localhost:6379   # Redis 地址
CACHE_ENABLED=true                 # 是否启用缓存层（false 降级直查库）
CACHE_TTL=300                      # 默认缓存 TTL（秒）

# 异步队列（BullMQ）
QUEUE_ENABLED=true                 # 是否启用队列（false 降级同步执行）

# AI 模型配置（可选，不配置则 AI 功能降级不可用；详见 docs/ai-agent.spec.md §环境变量）
AI_PROVIDER=deepseek               # deepseek | qwen | openai
DEEPSEEK_API_KEY=                  # 按 AI_PROVIDER 配置对应模型的 API Key 与 Base URL

# Headless API（AI-19，可选）
HEADLESS_API_KEY=                  # 第三方集成用 API Key（x-api-key 头校验；留空则 /headless 端点 401）
```

### 6.2 配置文件层次

```
.env                  # 默认（开发环境）
.env.staging          # NODE_ENV=staging
.env.production       # NODE_ENV=production
```

---

## 7. 部署

### 7.1 Docker 部署（生产）

```bash
# 1. 准备证书
mkdir certs && cp your-cert.crt certs/server.crt && cp your-key.key certs/server.key

# 2. 配置生产环境
cp Server-NestJS/.env.production.example Server-NestJS/.env.production
# 编辑 .env.production 填入真实值

# 3. 启动
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

### 7.2 数据库迁移

```bash
# 开发：自动同步（synchronize: true）
# 生产：生成迁移文件后手动执行
npm run migration:generate -- src/migrations/YourMigrationName
npm run migration:run
```

---

## 8. 命令速查

### 后端

| 命令 | 说明 |
|------|------|
| `npm run start:dev` | 开发启动（热重载） |
| `npm run build` | 编译 |
| `npm test` | 单元测试 |
| `npm run test:e2e` | 端到端测试 |
| `npm run test:cov` | 测试覆盖率（含门槛检查：statements≥40 / branches≥30 / functions≥40 / lines≥41） |
| `npm run lint` | 代码检查 |
| `npm run migration:generate` | 生成迁移文件 |
| `npm run backup` | 数据库备份（`data/backups/`，保留 BACKUP_KEEP=7 份） |
| `npm run restore -- <file>` | 数据库恢复（危险，先停应用） |
| `npm run migration:run` | 执行迁移 |

### 前端

| 命令 | 说明 |
|------|------|
| `flutter run` | 运行（连接设备/模拟器） |
| `flutter run -d chrome` | Web 运行 |
| `flutter test` | 测试（AuthProvider / EventsProvider / login_page，25 用例；CI 已纳入） |
| `flutter analyze` | 静态分析 |

### Docker

| 命令 | 说明 |
|------|------|
| `docker compose up --build` | 构建并启动（开发） |
| `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` | 生产启动 |
| `docker compose -f docker-compose.observability.yml up -d` | 可观测性栈（Prometheus/Grafana/Jaeger/Loki，本地 server 在宿主机时用） |
| `docker compose up redis` | 单独起 Redis（本地 server 在宿主机时用，缓存层） |
| `docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d --build` | 完整编排 + 监控（server 也在容器，需改 prometheus.yml targets 为 `server:3000`） |

**可观测性栈访问**（详见 `docker-compose.observability.yml` 注释）：
- Grafana `http://localhost:3001`（匿名，含 Prometheus + Loki 数据源；Alerting 页查看告警规则）
- Prometheus `http://localhost:9090`（`/rules` 查看告警规则）
- Jaeger `http://localhost:16686`
- Loki `http://localhost:3100`（需 `LOKI_ENABLED=true LOKI_URL=http://localhost:3100` 时 server 才推日志）

**告警规则**：`infra/observability/prometheus/rules/server-alerts.yml`（ServerDown / 高错误率 / 高延迟 / 高并发）

### 8.1 CI 流水线（GitHub Actions）

**CI 运行在 GitHub Actions**（仓库镜像到 GitHub，push 到 `main` 分支自动触发）。配置：`.github/workflows/ci.yml`（后端 lint + 单元/E2E 测试 + 构建 + 管理台构建 + Flutter analyze/test）。

**推送触发**：
1. 本地提交后执行 `git push github master:main`
2. 结果在 GitHub Actions 控制台查看

> 曾尝试 Gitee Go，因其免费版 node 版本过老、网页端配置受限已放弃（见私有 roadmap D.5）。`.workflow/` 目录已删除。

---

## 9. API 端点汇总

| Method | Path | Auth | 所有权校验 | 说明 |
|--------|------|------|-----------|------|
| POST | /api/v1/auth/register | No | — | 注册（限流 3/m，可带 inviteCode 邀请码 G-2） |
| POST | /api/v1/auth/login | No | — | 登录（限流 10/m） |
| POST | /api/v1/auth/refresh | No | — | 刷新 token |
| GET | /api/v1/auth/me | Yes | 当前用户 | 当前用户信息 |
| POST | /api/v1/auth/oauth | No | — | OAuth 第三方登录（Google/Apple/WeChat/Alipay），新用户自动注册（限流 10/m）；WeChat 加 `providerType: 'miniapp'` 走小程序 code2Session（MINI-3） |
| POST | /api/v1/auth/forgot-password | No | — | 忘记密码：发送重置邮件（防枚举统一响应，限流 5/m） |
| POST | /api/v1/auth/reset-password | No | — | 重置密码（邮件链接 token，限流 5/m） |
| POST | /api/v1/auth/verify-email | No | — | 邮箱验证（提交 6 位验证码，限流 5/m） |
| POST | /api/v1/auth/resend-verification | No | — | 重发邮箱验证码（防枚举统一响应，限流 5/m） |
| POST | /api/v1/auth/send-sms-code | No | — | 发送短信验证码（防枚举统一响应，限流 20/m） |
| POST | /api/v1/auth/bind-phone | Yes | 本人 | 绑定/更新手机号（校验验证码，占用 409） |
| POST | /api/v1/auth/login-phone | No | — | 手机号 + 验证码登录（限流 10/m） |
| POST | /api/v1/auth/deactivate | Yes | 本人 | 注销本人账号（密码确认 + 级联清理） |
| GET | /api/v1/auth/export-data | Yes | 本人 | 导出本人全量数据（数据可携带权） |
| GET | /api/v1/auth/invite | Yes | 本人 | 我的邀请信息：邀请码 + 已邀请用户列表（G-2） |
| GET | /api/v1/auth/oauth/providers | No | — | 获取已启用的 OAuth 提供商列表及元数据 |
| POST | /api/v1/auth/logout | Yes | 当前用户 | 登出当前设备 |
| GET | /api/v1/auth/sessions | Yes | 本人 | 登录设备会话列表（含 isCurrent） |
| DELETE | /api/v1/auth/sessions/:id | Yes | 本人 | 远程登出指定会话 |
| GET | /api/v1/health | No | — | 健康检查（?detail=true 返回 db/redis/queue/storage 状态，60/min 限流） |
| GET | /api/v1/metrics | No | — | Prometheus 指标（跳过限流）|
| GET | /api/v1/users | Yes (ADMIN) | — | 用户列表（分页） |
| POST | /api/v1/users | Yes (ADMIN) | — | 创建用户 |
| PATCH | /api/v1/users/:id/role | Yes (ADMIN) | — | 修改用户角色 |
| GET | /api/v1/users/:id | Yes | 本人或管理员 | 用户详情 |
| PUT | /api/v1/users/:id | Yes | 本人或管理员 | 更新用户 |
| DELETE | /api/v1/users/:id | Yes | 本人或管理员 | 删除用户（不能删自己/最后一个 admin） |
| POST | /api/v1/events | Yes | 创建者 | 创建事件 |
| POST | /api/v1/todos | Yes | 创建者 | 创建待办（未验证邮箱 403；组织成员自动带 orgId，同组可见） |
| GET | /api/v1/todos | Yes | 本人或同组 | 待办列表（本人 + 同组成员，ORG-3 v2） |
| PATCH | /api/v1/todos/:id | Yes | 本人或同组或管理员 | 更新待办 |
| PATCH | /api/v1/todos/:id/complete | Yes | 本人或同组或管理员 | 切换待办完成状态 |
| DELETE | /api/v1/todos/:id | Yes | 本人或同组或管理员 | 删除待办 |
| GET | /api/v1/events | Yes | 本人 | 范围查询事件 |
| GET | /api/v1/events/admin/all | Yes (ADMIN) | — | 全量事件列表（分页） |
| DELETE | /api/v1/events/admin/:id | Yes (ADMIN) | — | 删除任意事件 |
| GET | /api/v1/events/:id | Yes | 本人或管理员 | 事件详情 |
| PUT | /api/v1/events/:id | Yes | 本人或管理员 | 更新事件 |
| DELETE | /api/v1/events/:id | Yes | 本人或管理员 | 删除事件 |
| GET | /api/v1/audit/logs | Yes (ADMIN) | — | AI 审计日志（可按 userId / orgId / feedback=thumbs_down 过滤，ORG-5 组织维度） |
| GET | /api/v1/audit/verify | Yes (ADMIN) | — | AI 审计哈希链完整性校验（HS-11） |
| GET | /api/v1/audit/stats | Yes (ADMIN) | — | 全局 AI 用量统计 |
| GET | /api/v1/audit/cost | Yes (ADMIN) | — | AI 成本看板：按用户×模型×意图聚合 tokens（AI-21） |
| POST | /api/v1/audit/feedback | Yes | 本人 | 对话反馈：对某次对话点赞/点踩 + 原因（AI-18） |
| POST | /api/v1/feedback | Yes | 本人 | 应用内反馈：建议/问题/好评 → 通知管理员（G-1） |
| GET | /api/v1/audit/operations/logs | Yes (ADMIN) | — | 操作审计日志（写操作，可按 userId 过滤） |
| GET | /api/v1/audit/operations/verify | Yes (ADMIN) | — | 操作审计哈希链完整性校验（HS-11） |
| GET | /api/v1/audit/operations/stats | Yes (ADMIN) | — | 操作审计统计（按 action 分组） |
| GET | /api/v1/notifications | Yes | 本人 | 通知列表（分页） |
| GET | /api/v1/notifications/unread-count | Yes | 本人 | 未读通知数量 |
| PATCH | /api/v1/notifications/:id/read | Yes | 本人 | 标记单条通知已读 |
| PATCH | /api/v1/notifications/read-all | Yes | 本人 | 全部标记已读 |
| DELETE | /api/v1/notifications/:id | Yes | 本人 | 删除通知 |
| POST | /api/v1/notifications/stream | Yes | 本人 | 通知实时推送（SSE 长连接） |
| WS | /ws?token=&lt;jwt&gt; | 握手 JWT | 本人 | WebSocket 双向通道（RG-6）：握手失败 4401；通知推送（`notification` 事件）+ AI 流式（`ai:chat`/`ai:abort` → `ai:*` 事件）+ 通用双向 `message`；心跳 ping/pong；与 SSE 并存。协议详见 docs/ws-realtime.spec.md |
| POST | /api/v1/ai/chat | Yes | 当前用户 | AI 对话（非流式） |
| POST | /api/v1/ai/chat/stream | Yes | 当前用户 | AI 对话（SSE 流式；含 tool_start/tool_end 过程事件 + confirmation_request/confirmation_decision） |
| POST | /api/v1/ai/confirmations/:token | Yes | 本人 | 确认 AI 写操作（create_event/create_todo，approve/reject，未知 token 404） |
| DELETE | /api/v1/ai/memory | Yes | 本人 | 清除用户长期记忆（隐私） |
| POST | /api/v1/ai/insights | Yes | 当前用户 | 数据洞察报告（结构化统计） |
| GET | /api/v1/ai/conversations | Yes | 本人 | 对话历史列表 |
| GET | /api/v1/ai/conversations/:id | Yes | 本人 | 单个对话完整消息 |
| GET | /api/v1/ai/conversations/:id/trace | Yes | 本人 | 对话执行轨迹（P0-14：工具调用/确认决策/副作用/结果） |
| DELETE | /api/v1/ai/conversations/:id | Yes | 本人 | 删除指定对话 |
| DELETE | /api/v1/ai/conversations | Yes | 本人 | 清空所有对话 |
| POST | /api/v1/ai/knowledge | Yes (ADMIN) | — | 创建知识条目 |
| POST | /api/v1/ai/knowledge/upload | Yes (ADMIN) | — | 上传文档入库（PDF/DOCX，multipart，异步向量化） |
| GET | /api/v1/ai/knowledge | Yes (ADMIN) | — | 知识条目列表/搜索（?q=关键词） |
| GET | /api/v1/ai/knowledge/:id | Yes (ADMIN) | — | 知识条目详情 |
| GET | /api/v1/ai/knowledge/:id/chunks | Yes (ADMIN) | — | 文档切块预览（AI-16） |
| POST | /api/v1/ai/knowledge/debug | Yes (ADMIN) | — | 检索命中调试：结果 + 分数（AI-16） |
| GET | /api/v1/ai/knowledge/stats | Yes (ADMIN) | — | 知识库统计：条目/切块/存储量（AI-16） |
| PATCH | /api/v1/ai/knowledge/:id | Yes (ADMIN) | — | 更新知识条目 |
| DELETE | /api/v1/ai/knowledge/:id | Yes (ADMIN) | — | 删除知识条目 |
| GET | /api/v1/ai/eval/cases | Yes (ADMIN) | — | 评测集用例列表（AI-20） |
| POST | /api/v1/ai/eval/cases | Yes (ADMIN) | — | 新增评测用例（AI-20） |
| DELETE | /api/v1/ai/eval/cases/:id | Yes (ADMIN) | — | 删除评测用例（AI-20） |
| POST | /api/v1/ai/eval/run | Yes (ADMIN) | — | 跑评测批（AI-20，逐用例调 LLM） |
| GET | /api/v1/ai/eval/report | Yes (ADMIN) | — | 最近评测报告（AI-20） |
| POST | /api/v1/headless/chat | API Key | — | 无头对话（AI-19/HS-4）：x-api-key 认证（HEADLESS_API_KEY 或管理台创建 key），以 key 归属用户身份执行，复用 Agent 工具/记忆/审计，返回 reply+conversationId |
| POST | /api/v1/mcp | JWT | — | MCP 出口（HS-10）：现有 AI 工具暴露为 MCP server（JSON-RPC：initialize/ping/tools/list/tools/call），工具以调用者身份过同一治理层（权限+确认+审计），写工具返回需确认不自动执行 |
| GET | /api/v1/admin/mcp/servers | Yes (ADMIN) | — | 已注册外部 MCP server 列表（HS-10 入口 gateway） |
| POST | /api/v1/admin/mcp/servers | Yes (ADMIN) | — | 注册外部 MCP server（写入 Settings key mcp_servers） |
| DELETE | /api/v1/admin/mcp/servers/:name | Yes (ADMIN) | — | 移除外部 MCP server |
| GET | /api/v1/admin/mcp/tools | Yes (ADMIN) | — | 发现外部 MCP 工具（缓存 30s；?force=true 刷新） |
| POST | /api/v1/admin/mcp/call | Yes (ADMIN) | — | 调用外部 MCP 工具（强制过治理层：HS-9 权限/确认 + 审计） |
| GET | /api/v1/ai/tool-effects | Yes (ADMIN) | — | AI 写操作副作用记录（HS-3，可按 userId 过滤，含目标当前状态） |
| DELETE | /api/v1/ai/tool-effects/:id | Yes (ADMIN) | — | 撤销 AI 创建的 event/todo（HS-3，软删可经回收站恢复） |
| DELETE | /api/v1/ai/my/tool-effects/:id | Yes | 本人 | 撤销本人 AI 创建的记录（P0-15，所有权校验，软删可经回收站恢复） |
| GET | /api/v1/admin/headless-keys | Yes (ADMIN) | — | headless API Key 列表（HS-4） |
| POST | /api/v1/admin/headless-keys | Yes (ADMIN) | — | 创建 headless API Key（HS-4，返回明文仅此一次） |
| PATCH | /api/v1/admin/headless-keys/:id | Yes (ADMIN) | — | 更新 headless API Key（HS-4：配额/工具范围/归属/启停） |
| DELETE | /api/v1/admin/headless-keys/:id | Yes (ADMIN) | — | 删除 headless API Key（HS-4） |
| GET | /api/v1/points/me | Yes | 本人 | 我的积分/连签/今日签到状态（GROWTH-3） |
| POST | /api/v1/points/checkin | Yes | 本人 | 每日签到（checkin_date 唯一约束防重复，重复 409） |
| GET | /api/v1/points/leaderboard | Yes | 本人 | 积分排行榜（脱敏：昵称/头像/积分，不含内部 userId） |
| GET | /api/v1/points/achievements | Yes | 本人 | 成就列表（按正分毛累计判定，admin 扣分不回退） |
| POST | /api/v1/webhooks | Yes | 本人 | 订阅 Webhook（PL-14：name/url/events，服务端生成 HMAC secret） |
| GET | /api/v1/webhooks | Yes | 本人 | 我的 Webhook 订阅列表（视图不含 secret） |
| PATCH | /api/v1/webhooks/:id | Yes | 本人 | 启用/停用 Webhook |
| DELETE | /api/v1/webhooks/:id | Yes | 本人 | 删除 Webhook |
| POST | /api/v1/webhooks/test/:id | Yes | 本人 | 测试投递（返回签名与结果） |
| POST | /api/v1/upload | Yes | 上传者 | 上传文件 |
| GET | /api/v1/search | Yes | 本人 | 全局搜索（本人事件 + 公开用户） |
| POST | /api/v1/push/tokens | Yes | 本人 | 注册/更新设备推送 token |
| DELETE | /api/v1/push/tokens/:token | Yes | 本人 | 注销设备推送 token |
| GET | /api/v1/settings | Yes (ADMIN) | — | 全部动态配置（RG-2，实时生效） |
| PUT | /api/v1/settings/:key | Yes (ADMIN) | — | 更新/创建动态配置（维护模式/AI 每日限额等，写入 Settings 表即生效） |
| GET | /api/v1/admin/trash | Yes (ADMIN) | — | 回收站：已软删除的事件/待办（RG-3，events/todos 用 @DeleteDateColumn 软删，管理台可恢复；users/notifications 保持硬删） |
| POST | /api/v1/admin/trash/:type/:id/restore | Yes (ADMIN) | — | 恢复回收站记录（type: event\|todo） |
| GET | /api/v1/admin/templates | Yes (ADMIN) | — | 内置示例模板列表（PL-9） |
| POST | /api/v1/admin/templates/:id/import | Yes (ADMIN) | — | 一键导入模板数据（事件/待办种子，PL-9） |
| POST | /api/v1/admin/marketing/send | Yes (ADMIN) | — | 发送运营邮件（audience=all/admin/user，周报/活动，G-3） |
| GET | /api/v1/admin/analytics | Yes (ADMIN) | — | 平台数据统计：DAU/WAU/MAU/留存/功能漏斗/错误大盘（PL-15） |
| POST | /api/v1/admin/ai/chat | Yes (ADMIN) | — | 管理端 AI 助手：带平台实时上下文对话（AI-22） |
| GET | /api/v1/forms/:slug | Yes | 本人 | 读取表单定义（PL-10，按 slug） |
| POST | /api/v1/forms/:slug/submit | Yes | 本人 | 提交表单数据（按 schema 校验） |
| GET | /api/v1/forms/:slug/submissions | Yes | 本人 | 本人对该表单的提交记录 |
| GET | /api/v1/admin/forms | Yes (ADMIN) | — | 表单定义列表（PL-10） |
| POST | /api/v1/admin/forms | Yes (ADMIN) | — | 创建表单定义（PL-10） |
| PATCH | /api/v1/admin/forms/:id | Yes (ADMIN) | — | 更新表单定义（PL-10） |
| DELETE | /api/v1/admin/forms/:id | Yes (ADMIN) | — | 删除表单定义及提交（PL-10） |
| GET | /api/v1/admin/forms/:id/submissions | Yes (ADMIN) | — | 表单提交列表（PL-10） |
| GET | /api/v1/admin/plugins | Yes (ADMIN) | — | 已加载插件列表（PL-11） |
| POST | /api/v1/plugins/:path | Yes | — | 插件路由统一入口（PL-11，插件 registerRoute 注册） |
| POST | /api/v1/admin/import/users | Yes (ADMIN) | — | 批量导入用户（CSV，POV-2，返回成功/失败明细） |
| POST | /api/v1/admin/import/events | Yes (ADMIN) | — | 批量导入事件（CSV，POV-2，返回成功/失败明细） |
| POST | /api/v1/org/organizations | Yes (ADMIN) | — | 创建组织（ORG-1，创建者成 owner） |
| GET | /api/v1/org/organizations | Yes (ADMIN) | — | 组织列表（含成员/部门数，ORG-1） |
| GET | /api/v1/org/organizations/:id | Yes (ADMIN) | — | 组织详情（ORG-1） |
| PUT | /api/v1/org/organizations/:id | Yes (ADMIN) | — | 更新组织（ORG-1） |
| DELETE | /api/v1/org/organizations/:id | Yes (ADMIN) | — | 删除组织（有成员拒绝，ORG-1） |
| POST | /api/v1/org/organizations/:orgId/departments | Yes (ADMIN) | — | 创建部门（ORG-1） |
| GET | /api/v1/org/organizations/:orgId/departments | Yes (ADMIN) | — | 部门扁平列表（含 parentId，ORG-1） |
| PUT | /api/v1/org/departments/:id | Yes (ADMIN) | — | 更新部门（改名/移动上级，防环，ORG-1） |
| DELETE | /api/v1/org/departments/:id | Yes (ADMIN) | — | 删除部门（子孙上挂、成员脱离，ORG-1） |
| GET | /api/v1/org/organizations/:orgId/members | Yes (ADMIN) | — | 成员列表（脱敏，ORG-1） |
| POST | /api/v1/org/organizations/:orgId/members | Yes (ADMIN) | — | 添加成员（重复 409，ORG-1） |
| PUT | /api/v1/org/members/:id | Yes (ADMIN) | — | 更新成员（改角色/移部门，最后 owner 保护，ORG-1） |
| DELETE | /api/v1/org/members/:id | Yes (ADMIN) | — | 移除成员（最后 owner 拒绝，ORG-1） |
| POST | /api/v1/org/organizations/:orgId/invites | Yes (ADMIN) | — | 生成组织邀请码（ORG-6） |
| GET | /api/v1/org/organizations/:orgId/invites | Yes (ADMIN) | — | 组织邀请列表（ORG-6） |
| DELETE | /api/v1/org/invites/:id | Yes (ADMIN) | — | 撤销邀请（ORG-6） |
| POST | /api/v1/org/requests | Yes | 成员 | 提交组织申请（发起 FLOW 审批流，ORG-4） |
| GET | /api/v1/org/requests | Yes | 本人 | 我的申请列表（ORG-4） |
| GET | /api/v1/org/my | Yes | 成员 | 我的组织信息 + 部门路径（ORG-7） |
| GET | /api/v1/org/my/tree | Yes | 成员 | 我的组织部门树（只读，ORG-7） |
| GET | /api/v1/org/my/members | Yes | 成员 | 我的组织成员（脱敏白名单，ORG-7） |

---

## 10. 常见模式

### 前端：创建新的底部 Tab

```dart
// 1. app_shell.dart 的 NavigationBar 中添加 NavigationDestination
// 2. 在 _tabIndex 和 _onTabTap 中添加新 Tab 的处理
// 3. 在 app_localizations.dart 添加 tab 名称
// 4. 在 app_router.dart 添加路由
```

### 后端：创建新的 CRUD 模块

```typescript
// 1. nest g module features/xxx && nest g service features/xxx && nest g controller features/xxx
// 2. 创建 entity、dto
// 3. module 中 imports: [TypeOrmModule.forFeature([Xxx])]
// 4. 在 app.module.ts 中引入新模块
// 5. 在 controller 中添加 @CurrentUser() 参数做所有权校验
```

### AI 导航注册

新增功能页面时（无论是底部 Tab、顶层路由还是「更多」菜单），**必须同步注册到 AI 导航工具**，确保用户可以通过 AI 对话跳转到新页面：

```typescript
// src/ai/tools/navigate-page.tool.ts — PAGE_ROUTES 映射表
const PAGE_ROUTES: Record<string, { route: string; description: string }> = {
  // ... 已有页面 ...
  newFeature: { route: '/new-feature', description: '新功能页面描述' },
};
```

规则：
- key 为英文短名，供 LLM 识别
- route 为 GoRouter 定义的路由路径
- description 为中文描述，帮助 LLM 理解页面用途

### 页面返回功能

每个独立页面（非底部 Shell Tab 内的页面）**必须提供返回功能**，让用户能回到上一页：

```dart
// 🏗️ 在 CupertinoNavigationBar 中添加 leading 返回按钮
CupertinoNavigationBar(
  leading: CupertinoNavigationBarBackButton(
    previousPageTitle: l10n.back,
    onPressed: () => context.canPop() ? context.pop() : null,
  ),
  middle: Text(l10n.pageTitle),
)
```

规则：
- 底部 Shell 中的页面（Tab 页面）由 Tab Bar 切换，不需要额外返回按钮
- 非 Shell 页面（通过 routes 或 AI 导航跳转的页面）**必须加 leading 返回按钮**
- 导航方式：从 AI 页面跳转时用 `context.push(route)`（保留返回栈），不用 `context.go()`

### 前端：中英文对照填写

```dart
// 在 app_localizations.dart 中添加:
String get newLabel => _t('English Text', '中文文本');

// 使用:
Text(context.l10n.newLabel)
```

---

## 11. 文档管理

### 11.1 文档存放位置

所有设计文档统一放在项目根目录的 `docs/` 下：

```
docs/
├── ai-agent-requirements.md   # 需求确认书
├── ai-agent.spec.md           # 功能规格说明
├── oauth-config.md            # OAuth 第三方登录配置文档
└── ...                        # 后续功能文档
```

### 11.4 隐私政策与服务条款

文件结构：

```
Front-Flutter/lib/features/legal/
├── data/
│   └── legal_text.dart              # ← 文本数据源（中英文，唯一修改点）
└── presentation/pages/
    ├── privacy_policy_page.dart     # ← 隐私政策页面
    └── terms_of_service_page.dart   # ← 服务条款页面
```

**修改文本**：只需编辑 `legal_text.dart` 中的四个常量：

| 常量 | 内容 |
|------|------|
| `privacyPolicyEN` | 隐私政策英文版 |
| `privacyPolicyZH` | 隐私政策中文版 |
| `termsOfServiceEN` | 服务条款英文版 |
| `termsOfServiceZH` | 服务条款中文版 |

两个页面均从此文件读取，改一处两处自动同步。

**路由注册位置**：`lib/core/router/app_router.dart` 中 `/privacy` 和 `/terms` 两条路由。

**页面调用入口**：`lib/features/auth/presentation/pages/login_page.dart` 中的 `_buildAgreement()` 内通过 `context.push('/privacy')` 和 `context.push('/terms')` 跳转。
### 11.2 文档伴随代码变更

**文档与代码必须保持一致。** 对已有功能的任何改动（新增接口、修改数据模型、调整业务逻辑等），必须同步更新对应的设计文档：

| 变更类型 | 需更新的文档 |
|---------|-------------|
| 新增功能的 API 端点 | Spec 的「API 规格」章节 + API 端点汇总表 |
| 修改数据模型字段 | Spec 的「数据规格」章节 |
| 新增/删除业务规则 | Spec 的「业务规则」章节 |
| 修改前端交互流程 | Spec 的「界面规格」章节 |
| 修改环境变量 | 需求确认书的配置部分 + `.env.example` |

### 11.3 不写无文档的新功能

- **需求确认** → `docs/{feature}-requirements.md`
- **规格设计** → `docs/{feature}.spec.md`
- **架构决策** → `docs/adr/{编号}-{标题}.md`（ADR 记录）

三者至少完成前两者，才进入编码阶段。

### 11.5 Roadmap 维护（必须遵守）

**完整路线图已移至私有仓库（2026-08-13，公开仓库不再含 roadmap）。每个计划评审/完成后，把计划中未做、标记为「后续/不做」的工作追加到私有仓库的 `roadmap.md` 对应章节**，供后续按优先级执行。私有仓：本地 `C:\Rain6fish\KeelBase-private`（推送至 GitHub 私有 `rain6fish/keelbase-private`）。规则：

- 每条目标注：说明、依赖、状态（待办/进行中/已完成）
- 计划执行完毕时，在 roadmap「已完成」表追加一行（阶段 + 内容 + 提交 hash）
- 新增功能若产生新的「未做项」，同样追加；避免遗漏与重复
- 维护后推送：`cd C:\Rain6fish\KeelBase-private && git add -A && git commit -m "docs: ..." && git push`

---

## 12. 演示账号

首次启动后端（development）自动创建：

```
Username: alex
Password: 123456
Role: user

Username: admin
Password: Admin@1234
Role: admin
```

> `admin` 用于管理台（Web-Admin-Vue）登录。前端默认通过 ApiClient 对接真实后端 API。开发时确保 Server-NestJS 已启动。

---

## 13. 管理员管理台（Web-Admin-Vue）

> **技术栈（2026-08-12 决策，见私有 roadmap「WEB-ADMIN」章节）**：管理台为 **PC Web 管理台（Vue3 + Vuetify 3 + Vite + Pinia + TS，Materio 风格复刻，MIT 合规）**。已取代并废弃原 Taro-Admin（React H5）。后端 Admin API 完全复用。

**独立于主 app 的 Vue3 PC Web 管理台**，与 `Front-Taro`（主 app）代码/构建/部署完全隔离。主 app 不携带任何管理逻辑或入口。

**架构原则**：
- 独立入口 + 独立登录（`/auth/login`），登录后校验 `role === 'admin'`，非管理员拒绝进入
- 所有管理 API 带 `@CheckPolicies((a) => a.can('manage', 'all'))`（CASL），普通用户 token 返回 403
- `GET /auth/me` 返回 `role` 字段，供管理台判断管理员身份
- 路由 hash 模式（`createWebHashHistory`）——单容器 Nest 静态托管无 SPA fallback，hash 让 nginx + 单容器两套部署链零改动
- 部署建议：独立域名（如 `admin.example.com`）+ 可选 IP 白名单/VPN + MFA（见私有 roadmap D.1）

**开发命令**：
```bash
cd Web-Admin-Vue
npm install
npm run dev           # Vite dev server → http://localhost:10086/admin/（proxy /api → 后端 3000）
npm run build         # 构建静态产物 → dist/（base=/admin/）
npm run typecheck     # vue-tsc 类型检查
```

**模块**：登录 / 概览 / 用户管理（列表·角色·删除·详情）/ 事件管理（全量·删除）/ 知识库 / 通知广播 / 监控中心 / AI 审计 / 操作审计 / 会话管理 / 可观测性 / 系统信息 / 回收站 / 数据导入 / 模板市场 / AI 评测 / 工具与副作用 / 平台统计

### 13.1 Web-Admin-React（预览版 / Preview）

**定位：预览版（Preview）**——前端 UI 与 Vue 版（Web-Admin-Vue）保持一致，用于评估 React 技术方案；**Vue 版仍是主版本**，后续是否更新 React 版由用户单独决定（决定前不做部署/CI 接线）。

- **技术栈（2026-08-15）**：React 19 + TypeScript（strict）+ Vite 6 + **MUI**（Material UI，视觉对标 Vuetify/Materio，因 Vuetify 仅支持 Vue）+ react-router（hash 模式）+ Zustand + axios + i18next。
- **复用面**：API 客户端（统一解包 + 401 自动刷新）、localStorage keys（`admin_access_token/refresh_token/locale/theme`）、i18n 文案均与 Vue 版一致，两控制台共享同一后端会话。
- **模块范围**：与 Vue 版逐页对齐（24 个控制台页 + 工作台 + 登录/403）。
- **构建接线**：**本地 dev 独立**——`cd Web-Admin-React && npm run dev`（端口 10087，base `/admin-react/`，proxy `/api` → 3000）；未接入 CI/Docker/nginx。
- **命令**：`npm run typecheck` / `npm run lint` / `npm test` / `npm run build`

---

## 14. 行为准则（通用编码规范）

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 14.1 Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 14.2 Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 14.3 Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 14.4 Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
