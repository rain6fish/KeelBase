# 开发手册

> KeelBase — 面向开发者的架构指南、编码规范与工作流。

相关手册：
- [使用手册](usage.md)
- [运维手册](operations.md)

---

## 1. 架构总览

```
Front-Flutter (Flutter 3.x)  ──┐
Front-Taro (Taro H5/小程序)    ├──→  Server-NestJS (NestJS 11)  ──→  SQLite/PostgreSQL
Web-Admin-Vue (Vue3 管理台)      ──┘                                  Redis (缓存/队列)
```

| 层 | 技术 | 说明 |
|-----------|-------------|--------------|
| 前端 | Flutter 3.x + Provider + Dio + GoRouter | Material 3，三端 |
| Taro 前端 | Taro 3.6 + React + zustand | 主 App H5/小程序端 |
| 管理台 | Vue3 + Element Plus + Pinia（Web 端宿主：工作台 + 控制台同一壳） | 与移动主 App 代码/构建/部署分离 |
| 后端 | NestJS 11 + TypeScript + TypeORM | 模块化 + 装饰器 |
| 数据库 | SQLite (dev) / PostgreSQL (prod) | |
| 缓存与队列 | Redis 7 + CacheManager + BullMQ | Phase 3 |

---

## 2. 前端架构

### 2.1 数据流

```
User Action → Provider → Repository (interface) → RemoteDataSource → Dio/ApiClient → API
            → Model (fromJson/toJson) → notifyListeners() → UI rebuild
```

### 2.2 功能结构

```
features/<name>/
├── data/
│   ├── models/           # Model (fromJson/toJson)
│   ├── datasources/      # RemoteDataSource (HTTP 调用)
│   └── repositories/     # Repository 实现
├── domain/
│   └── repositories/     # Repository 接口
└── presentation/
    ├── providers/        # ChangeNotifier 状态
    └── pages/            # UI 页面
```

### 2.3 新增功能步骤

1. 创建 `features/<name>/{data,domain,presentation}`
2. 定义 Model → `data/models/xxx_model.dart`
3. 定义 Repository 接口 → `domain/repositories/xxx_repository.dart`
4. 创建 RemoteDataSource → `data/datasources/xxx_remote_datasource.dart`
5. 创建 Repository 实现 → `data/repositories/xxx_repository_impl.dart`
6. 创建 Provider → `presentation/providers/xxx_provider.dart`
7. 创建 UI → `presentation/pages/xxx_page.dart`
8. 在 `main.dart` 注册 Repository + Provider
9. 在 `core/i18n/app_localizations.dart` 添加 i18n 字符串
10. 在 `core/router/app_router.dart` 添加路由

### 2.4 约定

| 规则 | 说明 |
|-------------|---------------|
| 分层 | `features/{name}/{data,domain,presentation}` |
| 组件 | Screen = StatelessWidget + `context.watch`；Widget = 哑组件 |
| 主题 | 使用 `AppTheme`，禁止硬编码颜色 |
| 国际化 | 所有用户可见文本走 `AppLocalizations`，禁止硬编码 |
| 路由 | GoRouter + `StatefulShellRoute.indexedStack` + 重定向守卫 |
| 命名 | `snake_case.dart` 文件、`PascalCase` 类、`camelCase` 变量 |

### 2.5 导航设计原则

- **Shell 内页面（显示底部 Tab）**：高频导航页——Home、Events、Explore、AI、Profile、Settings
- **Shell 外页面（全屏，仅返回按钮）**：阅读/任务型页——隐私政策、服务条款、上传
- 跳入 Shell 外页面用 `context.push()`（保留返回栈），切 Tab 用 `context.go()`

---

## 3. 后端架构

### 3.1 模块结构

```
feature/
├── feature.module.ts      # imports/controllers/providers/exports
├── feature.controller.ts   # 路由 + Swagger 装饰器
├── feature.service.ts      # 业务逻辑
├── feature.entity.ts       # TypeORM 实体
└── dto/                    # 请求/响应 DTO
```

### 3.2 新增 CRUD 模块

```bash
nest g module features/xxx
nest g service features/xxx
nest g controller features/xxx
```

1. 创建 entity + dto
2. module imports 加 `TypeOrmModule.forFeature([Xxx])`
3. 在 `app.module.ts` 注册模块
4. 加 `@CurrentUser()` 参数做所有权校验
5. 管理端点：`@CheckPolicies((a) => a.can('manage', 'all'))`

### 3.3 全局基础设施

| 组件 | 类型 | 作用 |
|-----------------|------------|----------------|
| FeatureDisabledGuard | APP_GUARD | 特性开关；功能关闭返回 404（PL-8） |
| JwtAuthGuard | APP_GUARD | 全局 JWT 认证；`@Public()` 跳过 |
| MaintenanceGuard | APP_GUARD | 维护模式 503；`@SkipMaintenance()` 豁免（RG-2） |
| PoliciesGuard | APP_GUARD | CASL 策略守卫（路由级 + 行级） |
| ThrottlerGuard | APP_GUARD | 限流（全局 60 次/分钟） |
| ResponseInterceptor | APP_INTERCEPTOR | 统一 `{code, message, data, timestamp}` 包装 |
| AllExceptionsFilter | APP_FILTER | 全局异常处理 |
| ValidationPipe | APP_PIPE | whitelist + transform |
| LoggerModule | Module | pino 结构化日志 |

### 3.4 API 设计规范

```
URL:   /api/v1/{resources}       （仅名词复数）
方法:  GET=查询 POST=创建 PUT=更新 DELETE=删除
分页:  ?page=1&limit=20&sort=createdAt&order=desc
字段:  camelCase | 时间: ISO 8601 | 布尔: 无 is_ 前缀 | 空值: null
```

**统一响应**：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {},
  "timestamp": "2026-07-24T09:12:55Z"
}
```

### 3.5 权限控制（CASL）

- `admin` → `can('manage', 'all')`
- `user` → `can('manage', 'User', { id: sub })`、`can('manage', 'Event', { userId: sub })`
- 路由级：`@CheckPolicies((ability) => ability.can('manage', 'all'))`
- 行级：`@CurrentAbility()` + `ability.cannot('read', subject('Event', event))`

---

## 4. 测试

### 后端

| 命令 | 用途 |
|----------------|----------------|
| `npm test` | 单元测试 |
| `npm run test:e2e` | 端到端测试 |
| `npm run test:cov` | 覆盖率 |
| `npm run lint` | ESLint |

### 前端

| 命令 | 用途 |
|----------------|----------------|
| `flutter test` | Widget + provider 测试 |
| `flutter analyze` | 静态分析 |

### 覆盖率门槛

`jest.config.ts`：statements ≥40 / branches ≥30 / functions ≥40 / lines ≥41。

---

## 5. 规范与工作流

### 5.1 文档先行

每个功能变更必须先更新文档（见 [CLAUDE.md](../../CLAUDE.md) §11）：

1. 需求 → `docs/{feature}-requirements.md`
2. 规格 → `docs/{feature}.spec.md`
3. 再实现代码 + 测试

### 5.2 迁移

```bash
# 先生成基线，再增量
npm run migration:generate -- src/migrations/YourName
npm run migration:run
```

开发：`synchronize: true`。生产：`synchronize: false, migrationsRun: true`。

### 5.3 国际化

```dart
String get myLabel => _t('English', '中文');
Text(context.l10n.myLabel);
```

### 5.4 Roadmap 维护

完整路线图现在存放在**私有仓库**（2026-08-13；公开仓库不再包含）。每个计划评审/完成后，把未做/「后续」项追加到私有 roadmap（本地 `C:\Rain6fish\KeelBase-private\roadmap.md`，推送至 GitHub 私有仓库 `rain6fish/keelbase-private`）；完成项带 commit hash 追加到归档表。

---

## 6. 常用模式

### 6.1 新增底部 Tab

1. 在 `app_shell.dart` 添加 `NavigationDestination`
2. 在 `_tabIndex` / `_onTabTap` 处理
3. 在 `app_localizations.dart` 添加 Tab 名
4. 在 `app_router.dart` 添加路由

### 6.2 携带 JWT 的请求

```dart
final res = await ApiClient().get('/events', queryParameters: {...});
final res = await ApiClient().post('/auth/login', data: {...});
// 401 → 自动刷新 → 重试；刷新失败 → 登出 → 登录页
```

### 6.3 AI 导航注册

新增页面时，在 `src/ai/tools/navigate-page.tool.ts` 注册，AI 助手才能导航过去。
