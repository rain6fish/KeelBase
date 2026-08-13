# Development Manual / 开发手册

> KeelBase — 面向开发者的架构指南、编码规范与工作流。
> For developers. Architecture, conventions, testing, and workflows.

Related manuals / 相关手册：
- [Usage Manual / 使用手册](usage.md)
- [Operations Manual / 运维手册](operations.md)

---

## 1. Architecture Overview / 架构总览

```
Front-Flutter (Flutter 3.x)  ──┐
Front-Taro (Taro H5/小程序)    ├──→  Server-Nodejs (NestJS 11)  ──→  SQLite/PostgreSQL
Web-Admin (Vue3 管理台)      ──┘                                  Redis (缓存/队列)
```

| Layer / 层 | Tech / 技术 | Notes / 说明 |
|-----------|-------------|--------------|
| Frontend / 前端 | Flutter 3.x + Provider + Dio + GoRouter | Material 3，三端 |
| Frontend (Taro) / Taro 前端 | Taro 3.6 + React + zustand | 主 App H5/小程序端 |
| Admin Console / 管理台 | Vue3 + Vuetify3 + Pinia (独立构建) | 与主 App 完全隔离 |
| Backend / 后端 | NestJS 11 + TypeScript + TypeORM | 模块化 + 装饰器 |
| DB / 数据库 | SQLite (dev) / PostgreSQL (prod) | |
| Cache & Queue / 缓存与队列 | Redis 7 + CacheManager + BullMQ | Phase 3 |

---

## 2. Frontend Architecture / 前端架构

### 2.1 Data Flow / 数据流

```
User Action → Provider → Repository (interface) → RemoteDataSource → Dio/ApiClient → API
            → Model (fromJson/toJson) → notifyListeners() → UI rebuild
```

### 2.2 Feature Structure / 功能结构

```
features/<name>/
├── data/
│   ├── models/           # Model (fromJson/toJson)
│   ├── datasources/      # RemoteDataSource (HTTP calls)
│   └── repositories/     # Repository impl
├── domain/
│   └── repositories/     # Repository interface
└── presentation/
    ├── providers/        # ChangeNotifier state
    └── pages/            # UI screens
```

### 2.3 Adding a New Feature / 新增功能步骤

1. Create `features/<name>/{data,domain,presentation}`
2. Define Model → `data/models/xxx_model.dart`
3. Define Repository interface → `domain/repositories/xxx_repository.dart`
4. Create RemoteDataSource → `data/datasources/xxx_remote_datasource.dart`
5. Create Repository impl → `data/repositories/xxx_repository_impl.dart`
6. Create Provider → `presentation/providers/xxx_provider.dart`
7. Create UI → `presentation/pages/xxx_page.dart`
8. Register Repository + Provider in `main.dart`
9. Add i18n strings in `core/i18n/app_localizations.dart`
10. Add route in `core/router/app_router.dart`

### 2.4 Conventions / 约定

| Rule / 规则 | Detail / 说明 |
|-------------|---------------|
| Layering / 分层 | `features/{name}/{data,domain,presentation}` |
| Components / 组件 | Screen = StatelessWidget + `context.watch`; Widget = dumb component |
| Theme / 主题 | Use `AppTheme`, never hardcode colors |
| i18n / 国际化 | All user-visible text via `AppLocalizations`, never hardcode |
| Routing / 路由 | GoRouter + `StatefulShellRoute.indexedStack` + redirect guard |
| Naming / 命名 | `snake_case.dart` files, `PascalCase` classes, `camelCase` vars |

### 2.5 Navigation Design Principle / 导航设计原则

- **Shell pages (bottom tab bar shown) / Shell 内页面（显示底部 Tab）**: high-frequency navigation pages — Home, Events, Explore, AI, Profile, Settings
- **Non-shell pages (full-screen, back button only) / Shell 外页面（全屏，仅返回按钮）**: reading/task pages — Privacy Policy, Terms, Upload
- Navigate into non-shell pages with `context.push()` (keeps back stack), switch tabs with `context.go()`

---

## 3. Backend Architecture / 后端架构

### 3.1 Module Structure / 模块结构

```
feature/
├── feature.module.ts      # imports/controllers/providers/exports
├── feature.controller.ts   # routes + Swagger decorators
├── feature.service.ts      # business logic
├── feature.entity.ts       # TypeORM entity
└── dto/                    # request/response DTOs
```

### 3.2 Adding a New CRUD Module / 新增 CRUD 模块

```bash
nest g module features/xxx
nest g service features/xxx
nest g controller features/xxx
```

1. Create entity + dto
2. `TypeOrmModule.forFeature([Xxx])` in module imports
3. Register module in `app.module.ts`
4. Add `@CurrentUser()` params for ownership checks
5. For admin endpoints: `@CheckPolicies((a) => a.can('manage', 'all'))`

### 3.3 Global Infrastructure / 全局基础设施

| Component / 组件 | Type / 类型 | Purpose / 作用 |
|-----------------|------------|----------------|
| FeatureDisabledGuard | APP_GUARD | Feature flags; returns 404 when a feature is off (PL-8) |
| JwtAuthGuard | APP_GUARD | Global JWT auth; `@Public()` skips |
| MaintenanceGuard | APP_GUARD | Maintenance mode 503; `@SkipMaintenance()` exempts (RG-2) |
| PoliciesGuard | APP_GUARD | CASL policy guard (route-level + row-level) |
| ThrottlerGuard | APP_GUARD | Rate limiting (60 req/min global) |
| ResponseInterceptor | APP_INTERCEPTOR | Uniform `{code, message, data, timestamp}` wrap |
| AllExceptionsFilter | APP_FILTER | Global exception handling |
| ValidationPipe | APP_PIPE | whitelist + transform |
| LoggerModule | Module | pino structured logs |

### 3.4 API Design Rules / API 设计规范

```
URL:   /api/v1/{resources}       (nouns plural only)
Verbs: GET=query POST=create PUT=update DELETE=delete
Paging: ?page=1&limit=20&sort=createdAt&order=desc
Fields: camelCase | Time: ISO 8601 | Bool: no is_ prefix | Null: null
```

**Unified response / 统一响应**:

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {},
  "timestamp": "2026-07-24T09:12:55Z"
}
```

### 3.5 Authorization (CASL) / 权限控制

- `admin` → `can('manage', 'all')`
- `user` → `can('manage', 'User', { id: sub })`, `can('manage', 'Event', { userId: sub })`
- Route-level: `@CheckPolicies((ability) => ability.can('manage', 'all'))`
- Row-level: `@CurrentAbility()` + `ability.cannot('read', subject('Event', event))`

---

## 4. Testing / 测试

### Backend / 后端

| Command / 命令 | Purpose / 用途 |
|----------------|----------------|
| `npm test` | Unit tests / 单元测试 |
| `npm run test:e2e` | E2E tests / 端到端测试 |
| `npm run test:cov` | Coverage (40/30/40/41 thresholds) / 覆盖率 |
| `npm run lint` | ESLint |

### Frontend / 前端

| Command / 命令 | Purpose / 用途 |
|----------------|----------------|
| `flutter test` | Widget + provider tests |
| `flutter analyze` | Static analysis |

### Coverage Thresholds / 覆盖率门槛

`jest.config.ts`: statements ≥40 / branches ≥30 / functions ≥40 / lines ≥41.

---

## 5. Conventions & Workflows / 规范与工作流

### 5.1 Documentation-First / 文档先行

Every feature change must update docs first (see [CLAUDE.md](../../CLAUDE.md) §11):

1. Requirements → `docs/{feature}-requirements.md`
2. Spec → `docs/{feature}.spec.md`
3. Then implement code + tests

### 5.2 Migrations / 迁移

```bash
# Generate baseline first, then incremental
npm run migration:generate -- src/migrations/YourName
npm run migration:run
```

Dev: `synchronize: true`. Prod: `synchronize: false, migrationsRun: true`.

### 5.3 i18n / 国际化

```dart
String get myLabel => _t('English', '中文');
Text(context.l10n.myLabel);
```

### 5.4 Roadmap Maintenance / Roadmap 维护

When a plan is reviewed/completed, append any not-done / "later" items to `docs/roadmap.md`; append completed items to the archive table with commit hash.

---

## 6. Common Patterns / 常用模式

### 6.1 New Bottom Tab / 新增底部 Tab

1. Add `NavigationDestination` in `app_shell.dart`
2. Handle in `_tabIndex` / `_onTabTap`
3. Add tab name in `app_localizations.dart`
4. Add route in `app_router.dart`

### 6.2 API Call with JWT / 携带 JWT 的请求

```dart
final res = await ApiClient().get('/events', queryParameters: {...});
final res = await ApiClient().post('/auth/login', data: {...});
// 401 → auto refresh → retry; refresh fails → logout → login page
```

### 6.3 AI Navigation Registration / AI 导航注册

When adding a new page, register it in `src/ai/tools/navigate-page.tool.ts` so the AI assistant can navigate there.
