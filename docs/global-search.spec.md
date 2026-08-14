# 全局搜索（PL-4）功能规格 / Global Search (PL-4) Functional Specification

## 1. 概述 / Overview

统一搜索入口：一次查询返回**本人事件** + **匹配用户**（公开信息）。入口在 Dashboard 首页搜索框。

A unified search entry: a single query returns **the user's own events** + **matching users** (public info). The entry point is the search box on the Dashboard home page.

## 2. 搜索范围与隐私 / Search Scope and Privacy

| 模块 / Module | 搜索范围 / Search Scope | 数据隔离 / Data Isolation |
|------|----------|----------|
| events | 本人事件（title/description LIKE） / The user's own events (title/description LIKE) | 复用 `EventsService.search` 的 userId 强隔离 / Reuses the strong userId isolation of `EventsService.search` |
| users | username/nickname LIKE | 仅返回公开字段 `id/username/nickname/avatarUrl`，不泄露 email/phone/role/生日 / Only returns public fields `id/username/nickname/avatarUrl`; does not leak email/phone/role/birthday |

用户搜索对普通用户开放（"找人"），与 users/:id 的 CASL 私有规则不冲突。

User search is open to normal users ("find people") and does not conflict with the CASL private rules of users/:id.

## 3. API 规格 / API Specification

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| GET | /api/v1/search?q=&page=&limit= | 登录 / Login | 聚合搜索本人事件 + 公开用户 / Aggregated search of the user's own events + public users |

### 响应 / Response

```json
{
  "data": {
    "events": { "items": [...], "total": 1, "page": 1, "limit": 10 },
    "users": { "items": [{ "id": 9, "username": "alex", "nickname": "Alex", "avatarUrl": null }], "total": 1, "page": 1, "limit": 10 }
  }
}
```

## 4. 模块结构 / Module Structure

- `SearchModule`：注入已导出的 `EventsService` + `UsersService`（两者模块均 export，无需改）
  `SearchModule`: injects the already-exported `EventsService` + `UsersService` (both modules are already exported; no changes needed)
- `SearchService.searchAll(q, userId, page, limit)`：并行查询 events（本人）+ users（公开）；空关键词直接返回空
  `SearchService.searchAll(q, userId, page, limit)`: queries events (the user's own) + users (public) in parallel; an empty keyword returns empty directly
- `UsersService.searchUsers(keyword, page, limit)`：新增，LIKE username/nickname，只映射公开字段
  `UsersService.searchUsers(keyword, page, limit)`: new method, LIKE on username/nickname, maps only public fields

## 5. 前端 / Frontend

- Dashboard 首页新增搜索框（仿 AI 输入框样式）→ `context.push('/search')`
  Add a search box to the Dashboard home page (styled like the AI input box) → `context.push('/search')`
- `SearchPage`（`/search`，Shell 外全屏页）：顶部 `CupertinoSearchTextField` + 事件/用户 Tab + 结果列表
  `SearchPage` (`/search`, full-screen page outside the Shell): `CupertinoSearchTextField` on top + events/users tabs + result list
- `SearchProvider.search(q)`；`SearchRepository` → `GET /search`
  `SearchProvider.search(q)`; `SearchRepository` → `GET /search`
- 路由 `/search` 需登录（默认守卫）
  Route `/search` requires login (default guard)

## 6. 测试 / Testing

- 后端单测：SearchService 2 用例（聚合 + 空查询）、UsersService.searchUsers 2 用例（公开字段 + LIKE 条件）
  Backend unit tests: 2 cases for SearchService (aggregation + empty query), 2 cases for UsersService.searchUsers (public fields + LIKE condition)
- 后端 e2e：3 用例（搜到本人事件、用户公开字段无 email、未登录 401）
  Backend e2e: 3 cases (finds the user's own events, user public fields contain no email, 401 when not logged in)
- 前端单测：search_provider_test 4 用例
  Frontend unit tests: 4 cases in search_provider_test
