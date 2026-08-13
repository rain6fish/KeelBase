# KeelBase 代码知识图谱扫描报告

> 由 codebase-memory-mcp 对全仓库做静态解析后生成的架构快照。
> 生成日期：2026-08-11 ｜ 索引模式：full（persistence=true）
> 数据文件：`.codebase-memory/graph.db.zst`（可提交共享）
>
> **注**：2026-08-12 管理台已从 Front-Taro-Admin（React H5）迁移到 Web-Admin（Vue3 PC Web）。本文是 08-11 的历史快照，文中 Front-Taro-Admin 路径引用已失效，仅作历史存档。

---

## 1. 总览

| 指标 | 数值 |
|------|------|
| 项目名 | KeelBase |
| 图节点总数 | 5,174 |
| 图边总数 | 12,148 |
| 索引文件数 | 690（含 405 TS / 123 Dart / 38 SCSS / 14 YAML / 8 JS / 5 Swift / 4 Bash / 4 HTML / 3 SQL / 2 C） |
| 四端结构 | Front-Flutter（Flutter 主 App）+ Front-Taro（小程序/H5）+ Web-Admin（Vue3 管理台）+ Server-Nodejs（NestJS 后端） |
| 排除目录 | `node_modules`、`dist`、`build`、`coverage`、`.git`、`.claude`、`.idea`、`uploads`、`.dart_tool` 等 18 类 |

**图结构统计**（节点标签）：

| 标签 | 数量 | 说明 |
|------|------|------|
| Method | 1,071 | 方法 |
| File | 690 | 文件 |
| Module | 688 | 模块/文档节点 |
| Section | 679 | 段落 |
| Function | 520 | 函数 |
| Class | 437 | 类 |
| Variable | 431 | 变量 |
| Folder | 330 | 目录 |
| Interface | 159 | 接口 |
| Route | 102 | HTTP 路由 |
| Decorator | 32 | 装饰器 |
| Type / Enum | 22 / 9 | 类型 / 枚举 |

**关系类型**（边）：

| 类型 | 数量 | 说明 |
|------|------|------|
| DEFINES | 4,032 | 定义关系 |
| USAGE | 2,617 | 引用关系 |
| CALLS | 1,727 | 函数调用 |
| DECORATES | 772 | NestJS 装饰器 |
| IMPORTS | 713 | 导入关系 |
| CONTAINS_FILE / FOLDER | 690 / 251 | 目录树 |
| TESTS_FILE | 75 | 测试文件映射 |
| HTTP_CALLS | 38 | 前端→后端 HTTP 调用 |
| INHERITS | 31 | 继承关系 |

---

## 2. 包与依赖分层

**包内节点数 Top**：`src`（Server-Nodejs，1,291）＞ `lib`（Front-Flutter，600）＞ `test`（42）＞ `android`（27）＞ `scripts`（24）＞ `Makefile`（16）＞ `ios`（10）。

**分层判定**：

| 层 | 包/模块 | 依据 |
|----|---------|------|
| core | `src`（Server-Nodejs） | 高扇入（48 in, 2 out），被全端依赖 |
| core | `android` / `Makefile` | 高扇入（15–20 in, 0 out） |
| internal | `lib`（Front-Flutter） | 扇入 47 / 扇出 54 |
| entry | `test` / `ios` / `scripts` | 仅出站调用 / 入口点 |
| api | 各 Controller | 含 HTTP 路由定义 |

**跨包调用边界**：`test→lib`（47）、`lib→src`（35）、`test→Makefile`（18）、`lib→android`（14）、`scripts→src`（4）。

> 依赖方向健康：`lib`（Flutter）与 `Front-Taro*` 只出站依赖 `Server-Nodejs/src`，无反向依赖，符合前后端解耦。

---

## 3. 入口点（Entry Points）

| 入口 | 位置 | 作用 |
|------|------|------|
| `main` | Front-Flutter/lib/main.dart | Flutter 主 App 入口（依赖注入 + MultiProvider） |
| `detectLocale` / `t` / `tFeature` | Front-Taro-Admin/src/i18n | 管理台 i18n（zh/en 双语） |
| `getUsers` / `updateUserRole` / `deleteUser` | Front-Taro-Admin/src/services/admin-service.ts | 管理台用户管理 |
| `getAllEvents` / `deleteEvent` | Front-Taro-Admin/src/services/admin-service.ts | 管理台事件管理 |
| `getAuditLogs` / `getAuditStats` / `getOperationAuditLogs` | Front-Taro-Admin/src/services/admin-service.ts | 审计监控 |
| `getMonitorSummary` / `getOverview` / `getSessions` / `revokeSession` | Front-Taro-Admin/src/services/admin-service.ts | 监控/会话管理 |
| `broadcastNotification` | Front-Taro-Admin/src/services/admin-service.ts | 通知广播 |

---

## 4. API 路由（Route，共 102 条）

图解析出的主要分组（完整清单以 CLAUDE.md「API 端点汇总」为准）：

| 前缀 | 端点示例 |
|------|---------|
| `/api/v1/health` | 健康检查 |
| `/api/v1/app/version` | App 版本检查 |
| `/api/v1/auth/*` | register / login / refresh / logout / me / forgot-password / reset-password / verify-email / resend-verification / sessions 等 |
| `/api/v1/users` | 用户列表（Admin）、创建、详情、角色修改 |
| `/api/v1/events` | 事件 CRUD + `GET /api/v1/events/search` 全局搜索 |
| `/api/v1/todos` | 待办 CRUD + complete |
| `/api/v1/ai/*` | chat / chat/stream / confirmations / memory / insights / conversations / knowledge / eval |
| `/api/v1/audit/*` | AI 审计 + 操作审计（logs / stats / cost / feedback） |
| `/api/v1/admin/*` | trash / templates / marketing / analytics / ai / forms / import / plugins |
| 其余 | notifications / upload / search / push / settings / forms / plugins / feedback / headless |

---

## 5. 事实模块聚类（Leiden Clustering）

对调用图做社区检测，识别出代码中实际存在的模块边界（与目录布局有出入）：

| 聚类 | 成员数 | 内聚度 | Top 节点 |
|------|--------|--------|---------|
| Front-Taro-Admin | 99 | 0.82 | `t`、AdminLayout、UsersPage、EventsPage、load |
| Front-Flutter（核心 UI） | 77 | 0.86 | _initApp、test、main、NotificationModel |
| Front-Taro（API 客户端） | 58 | 0.98 | request、delete、tryRefreshToken、logout、saveTokens |
| Server-Nodejs Auth | 40 | 0.98 | of（BusinessException）、login、hashToken、register、generateRefreshToken |
| Server-Nodejs RAG | 27 | 0.97 | chunkText、isVectorAvailable、createDocument、searchImpl、findOne |
| Front-Flutter 事件日历 | 32 | 0.86 | build、_buildWeekView、_sameDay、_buildBody |

> 高内聚（≥0.86）的聚类表明认证、RAG、事件日历等模块边界清晰，职责单一。

---

## 6. 热点与高复杂度函数

**按扇入（fan-in）排名的热区**：

| 符号 | 位置 | 扇入 | 说明 |
|------|------|------|------|
| `t` | Front-Taro-Admin/src/i18n | 66 | 国际化翻译入口，被全局复用 |
| `test` | Makefile | 18 | 测试命令 |
| `fetch` | Front-Taro-Admin/stores/users-store | 15 | 用户数据拉取 |
| `CheckPolicies` | Server-Nodejs/common/casl | 14 | CASL 策略装饰器（全后端授权） |
| `BusinessException.of` | Server-Nodejs/common/errors | 13 | 统一业务异常工厂 |
| `SkipAudit` | Server-Nodejs/operation-audit | 11 | 操作审计跳过装饰器 |
| `hashToken` | Server-Nodejs/auth | 9 | Refresh token SHA-256 哈希 |
| `request` | Front-Taro/services/api-client | 9 | Taro 端请求封装 |

**高复杂度函数（认知复杂度 ≥ 10，排除测试/构建脚本）**：

| 函数 | 位置 | 圈复杂度 | 认知复杂度 | 行数 | 嵌套循环深度 |
|------|------|---------|-----------|------|-------------|
| `main` | scripts/healthcheck.ts | 20 | 29 | 113 | 1 |
| `request` | Front-Taro/src/services/api-client.ts | 11 | 23 | 66 | 1 |
| `chunkText` | Server-Nodejs/src/ai/rag/chunk-text.ts | 11 | 20 | 72 | **2** |
| `KnowledgePage` | Front-Taro-Admin/pages/knowledge | 14 | 19 | 216 | 1 |
| `dirSize` | scripts/healthcheck.ts | 7 | 18 | 18 | 1 |
| `UsersPage` | Front-Taro-Admin/pages/users | 10 | 15 | 226 | 1 |
| `validateFileMagicBytes` | Server-Nodejs/common/utils/file-validator.ts | 6 | 11 | 31 | 0 |
| `TodosPage` | Front-Taro/src/pages/todos | 8 | 11 | 137 | 1 |
| `validateModuleGraph` | Server-Nodejs/common/modules/modules-manifest.ts | 5 | 10 | 17 | 2 |

> 建议关注：`chunkText`（RAG 切块，嵌套循环深度 2，是向量化主路径）与 `api-client.request`（Taro 端请求重试逻辑）——如需优化可从这两处入手，拆分或增加测试覆盖。

---

## 7. Server-Nodejs 后端模块清单

按目录解析出的 NestJS 模块（`src/` 下共 37 个子目录）：

| 领域 | 模块 |
|------|------|
| 认证/账户 | auth（OAuth / 会话 / 手机号 / 邮箱验证）、users、sms、mail |
| 业务 | events、todos、notifications、push、search、form-builder、feedback、templates、data-import |
| AI 平台 | ai（agents / audit / confirmation / conversation / embeddings / eval / insights / memory / providers / rag / skills / tools）、headless、maintenance-tasks（proactive-ai） |
| 管理/运营 | admin、operation-audit、marketing、settings、feature-flags、alert-webhook |
| 平台能力 | common（casl / cache / errors / filters / interceptors）、metrics、health、app-version、plugins、queue、circuit-breaker、storage、upload、migrations、config |

---

## 8. 数据来源与再扫描

- 索引命令：`index_repository(repo_path=<仓库根>, mode=full, name=KeelBase, persistence=true)`
- 图持久化于 `.codebase-memory/graph.db.zst`，后续会话可直接 `get_architecture` / `query_graph` 复用，无需重新全量扫描（改代码后增量重扫即可）。
- 可深挖维度：`search_graph`（语义检索）、`trace_path`（调用链/数据流）、`query_graph`（复杂度/循环嵌套热点）——需要时在对应会话中按本报告章节定位查询。
