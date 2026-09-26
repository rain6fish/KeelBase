# 全局搜索（PL-4）功能规格 / Global Search (PL-4) Functional Specification

## 1. 概述 / Overview

统一搜索入口：一次查询返回**本人事件** + **匹配用户**（公开信息）+ **声明了 `searchable` 的生成模块的本人记录**。入口在 Dashboard 首页搜索框。

A unified search entry: a single query returns **the user's own events** + **matching users** (public info) + **the caller's own rows from generated modules that declared `searchable`**. The entry point is the search box on the Dashboard home page.

## 2. 搜索范围与隐私 / Search Scope and Privacy

| 模块 / Module | 搜索范围 / Search Scope | 数据隔离 / Data Isolation |
|------|----------|----------|
| events | 本人事件（title/description LIKE） / The user's own events (title/description LIKE) | 复用 `EventsService.search` 的 userId 强隔离 / Reuses the strong userId isolation of `EventsService.search` |
| users | username/nickname LIKE | 仅返回公开字段 `id/username/nickname/avatarUrl`，不泄露 email/phone/role/生日 / Only returns public fields `id/username/nickname/avatarUrl`; does not leak email/phone/role/birthday |
| 生成模块 / generated modules | 只在 `.keelbase/manifest.json` 的 `searchableModules` 里列出的模块；匹配其**文本列**（varchar/text，含 enum 列） / Only the modules listed in `searchableModules` in `.keelbase/manifest.json`; matches their **text columns** (varchar/text, including `enum` columns) | 每条 OR 分支都带归属条件（`userId`/`requesterId`/`initiatorId`），故命中也逃不出调用方范围；**没有归属列的实体一律跳过**（fail-closed） / Every OR-arm carries the ownership condition (`userId`/`requesterId`/`initiatorId`), so a hit cannot escape the caller's scope; **an entity with no ownership column is skipped** (fail-closed) |

可搜与否由**模块 spec 的声明**决定，运行时不做推断：`keelbase init` 把 `searchable: true` 的模块记进清单，搜索服务只读清单。故生成的模块**由构造就可搜**，不需要手工维护清单、也不需要生成器往手写源码里插行。声明了 `searchable` 但 spec 里没有 `string`/`text`/`enum` 字段时，**生成期直接报错** —— 索引只能匹配文本列，否则那条声明兑现不了任何东西。

Whether a module is searchable is decided by **its spec**, never inferred at runtime: `keelbase init` records modules with `searchable: true` into the manifest, and the search service only reads that list. A generated module is therefore searchable **by construction** — no hand-maintained registry, and no generator insertion into hand-written source. Declaring `searchable` on a spec with no `string`/`text`/`enum` field is **refused at generation time**, because a `LIKE` index has nothing to match and the declaration would deliver nothing.

用户搜索对普通用户开放（"找人"），与 users/:id 的 CASL 私有规则不冲突。

User search is open to normal users ("find people") and does not conflict with the CASL private rules of users/:id.

## 3. API 规格 / API Specification

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| GET | /api/v1/search?q=&page=&limit= | 登录 / Login | 聚合搜索本人事件 + 公开用户 + 可搜生成模块的本人记录 / Aggregated search of the user's own events + public users + the caller's own rows in searchable modules |

### 响应 / Response

```json
{
  "data": {
    "events": { "items": [...], "total": 1, "page": 1, "limit": 10, "totalPages": 1 },
    "users": { "items": [{ "id": 9, "username": "alex", "nickname": "Alex", "avatarUrl": null }], "total": 1, "page": 1, "limit": 10, "totalPages": 1 },
    "modules": [
      { "module": "books", "items": [{ "id": 3, "title": "Clean Code", "userId": 5 }], "total": 1, "page": 1, "limit": 10, "totalPages": 1 }
    ]
  }
}
```

三个桶**同形**：都过共用的 `paginated()`（`items/total/page/limit/totalPages`，单源在 `src/common/dto/paginated.ts`），模块桶另加一个 `module` 字段。`page`/`limit` 在 `searchAll` **入口处钳一次**（`limit` 1–100）——`totalPages` 是 `total / limit`，不钳的话查询参数里的 `limit=0` 会算出 `NaN`，序列化后成 `null`。模块桶的 `items` 是原始实体行（未做字段投影），`total` 是范围内命中总数、与 `items` 同口径（否则翻页会翻出空页）。

`modules` 恒为数组：清单没声明任何可搜模块时是 `[]`（不是缺键）。

All three buckets share one shape: each goes through the shared `paginated()` (`items/total/page/limit/totalPages`, single-sourced in `src/common/dto/paginated.ts`), and a module bucket adds a `module` field. `page`/`limit` are clamped **once, at the `searchAll` entry point** (`limit` 1–100) — `totalPages` is `total / limit`, so an unclamped `limit=0` from a query parameter would compute `NaN` and serialise as `null`. A module bucket's `items` are raw entity rows (no field projection), and `total` counts everything that matched in scope, agreeing with `items` (or paging walks into empty pages). `modules` is always an array — `[]` when the manifest declares no searchable module (absent, not missing).

## 4. 模块结构 / Module Structure

- `SearchModule`：注入已导出的 `EventsService` + `UsersService`（两者模块均 export，无需改）+ 全局 `DataSource`（`@InjectDataSource`，由 TypeOrmModule.forRoot 的全局模块提供）
  `SearchModule`: injects the already-exported `EventsService` + `UsersService` (both modules are already exported; no changes needed) + the global `DataSource` (`@InjectDataSource`, provided by the global module behind `TypeOrmModule.forRoot`)
- `SearchService.searchAll(q, userId, page, limit)`：并行查询 events（本人）+ users（公开）+ 清单里的可搜模块；空关键词直接返回空
  `SearchService.searchAll(q, userId, page, limit)`: queries events (the user's own) + users (public) + the searchable modules in the manifest, in parallel; an empty keyword returns empty directly
- `UsersService.searchUsers(keyword, page, limit)`：新增，LIKE username/nickname，只映射公开字段
  `UsersService.searchUsers(keyword, page, limit)`: new method, LIKE on username/nickname, maps only public fields
- `common/provenance/application-manifest.ts`：定位并解析 `.keelbase/manifest.json` 的**单源**读取器，`SearchService` 与 `/app/provenance`、管理台 AI 共用（路径约定「cwd 上一层优先」只有一处）
  `common/provenance/application-manifest.ts`: the **single** reader that locates and parses `.keelbase/manifest.json`, shared by `SearchService`, `/app/provenance` and the admin AI (the "one level above cwd first" path convention lives in exactly one place)
- `search/searchable-entities.ts`：把清单里的模块名解析成「可查询目标」（实体 + 归属列 + 文本列）；列类型由 `driver.normalizeType()` 归一后判定，够不够格的规则见 §2
  `search/searchable-entities.ts`: resolves manifest module names into queryable targets (entity + ownership column + text columns); column types are judged after `driver.normalizeType()` normalisation, and the qualifying rules are in §2

## 5. 前端 / Frontend

- Dashboard 首页新增搜索框（仿 AI 输入框样式）→ `context.push('/search')`
  Add a search box to the Dashboard home page (styled like the AI input box) → `context.push('/search')`
- `SearchPage`（`/search`，Shell 外全屏页）：顶部 `CupertinoSearchTextField` + 事件/用户 Tab + 结果列表；**尚未渲染 `modules` 桶**（见下）
  `SearchPage` (`/search`, full-screen page outside the Shell): `CupertinoSearchTextField` on top + events/users tabs + result list; the `modules` bucket is **not rendered yet** (see below)
- `SearchProvider.search(q)`；`SearchRepository` → `GET /search`
  `SearchProvider.search(q)`; `SearchRepository` → `GET /search`
- 路由 `/search` 需登录（默认守卫）
  Route `/search` requires login (default guard)

**尚未接线（诚实记录，勿当已做 / Not wired yet, stated so it is not mistaken for done）**：两端搜索结果页都还没有渲染 `modules` 桶的 UI，模块自身的列表端点也还没有 `q` 过滤。要在界面上按模块渲染，先得有一条「这个模块拿哪一列当标题」的展示约定 —— 桶里的 `items` 是原始实体行，客户端无从知道该显示什么。Neither frontend renders the `modules` bucket yet, and a module's own list endpoint has no `q` filter. Rendering the bucket per module needs a display convention first — which column is a given module's title — because the bucket carries raw entity rows and a client cannot know what to show.

## 6. 测试 / Testing

- 后端单测：SearchService 2 用例（聚合 + 空查询）、UsersService.searchUsers 2 用例（公开字段 + LIKE 条件）
  Backend unit tests: 2 cases for SearchService (aggregation + empty query), 2 cases for UsersService.searchUsers (public fields + LIKE condition)
- 后端 e2e：3 用例（搜到本人事件、用户公开字段无 email、未登录 401）
  Backend e2e: 3 cases (finds the user's own events, user public fields contain no email, 401 when not logged in)
- 前端单测：search_provider_test 4 用例
  Frontend unit tests: 4 cases in search_provider_test
- P0-9a 追加（2026-09-26）：`SearchService` **10 用例**（真 `better-sqlite3` 驱动 + 真实体，仅替换「读清单文件」这一步：命中 / 跨用户隔离 / 多列匹配 / 软删不出现 / `limit` 与 `total` 同口径 / page·limit 入口钳制 / 未声明不搜 / 清单缺失）；`searchable-entities` **7 用例**（归属列缺失跳过、无文本列跳过、实体未注册跳过、按实体自身主键排序（主键非 `id` 也照样）、未在清单不返回、清单顺序）；`application-manifest` **6 用例**（缺 / 坏 / 非对象 / 两种 cwd 布局）；e2e **2 用例**（`modules` 桶恒在、命中本人且不含他人同名记录）
  P0-9a additions (2026-09-26): **10 cases** for `SearchService` (a real `better-sqlite3` driver with real entities; only the manifest *file read* is stubbed: hit / cross-user isolation / multi-column match / soft-deleted rows absent / `limit` and `total` agree / `page`·`limit` clamped at the entry point / not declared means not searched / manifest missing); **7 cases** for `searchable-entities` (no ownership column, no text column, no primary key, entity not registered, ordering by the entity's own primary key, manifest order); **6 cases** for `application-manifest` (absent / unparsable / non-object / both cwd layouts); **2** e2e cases (the `modules` bucket is always present; a hit returns the caller's own row and not another user's same-named one)
