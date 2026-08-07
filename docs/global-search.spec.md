# 全局搜索（PL-4）功能规格

## 1. 概述

统一搜索入口：一次查询返回**本人事件** + **匹配用户**（公开信息）。入口在 Dashboard 首页搜索框。

## 2. 搜索范围与隐私

| 模块 | 搜索范围 | 数据隔离 |
|------|----------|----------|
| events | 本人事件（title/description LIKE） | 复用 `EventsService.search` 的 userId 强隔离 |
| users | username/nickname LIKE | 仅返回公开字段 `id/username/nickname/avatarUrl`，不泄露 email/phone/role/生日 |

用户搜索对普通用户开放（"找人"），与 users/:id 的 CASL 私有规则不冲突。

## 3. API 规格

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | /api/v1/search?q=&page=&limit= | 登录 | 聚合搜索本人事件 + 公开用户 |

### 响应

```json
{
  "data": {
    "events": { "items": [...], "total": 1, "page": 1, "limit": 10 },
    "users": { "items": [{ "id": 9, "username": "alex", "nickname": "Alex", "avatarUrl": null }], "total": 1, "page": 1, "limit": 10 }
  }
}
```

## 4. 模块结构

- `SearchModule`：注入已导出的 `EventsService` + `UsersService`（两者模块均 export，无需改）
- `SearchService.searchAll(q, userId, page, limit)`：并行查询 events（本人）+ users（公开）；空关键词直接返回空
- `UsersService.searchUsers(keyword, page, limit)`：新增，LIKE username/nickname，只映射公开字段

## 5. 前端

- Dashboard 首页新增搜索框（仿 AI 输入框样式）→ `context.push('/search')`
- `SearchPage`（`/search`，Shell 外全屏页）：顶部 `CupertinoSearchTextField` + 事件/用户 Tab + 结果列表
- `SearchProvider.search(q)`；`SearchRepository` → `GET /search`
- 路由 `/search` 需登录（默认守卫）

## 6. 测试

- 后端单测：SearchService 2 用例（聚合 + 空查询）、UsersService.searchUsers 2 用例（公开字段 + LIKE 条件）
- 后端 e2e：3 用例（搜到本人事件、用户公开字段无 email、未登录 401）
- 前端单测：search_provider_test 4 用例
