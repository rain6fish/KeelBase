# Redis 缓存层（Phase 3.1）功能规格 / Redis Cache Layer (Phase 3.1) Feature Specification

## 1. 概述 / 1. Overview

引入 Redis 缓存层，缓存高频读取数据（用户信息、事件列表、OAuth 配置），降低 DB 压力。依赖 `ioredis` + `@nestjs/cache-manager`；**可降级**——`CACHE_ENABLED=false` 或 Redis 不可用时直接查库，不阻塞业务（同 MailService/Storage 降级语义）。

Introduces a Redis cache layer that caches high-frequency read data (user info, event lists, OAuth config) to reduce DB pressure. Depends on `ioredis` + `@nestjs/cache-manager`; **degradable** — when `CACHE_ENABLED=false` or Redis is unavailable, it falls back to direct DB queries without blocking business (same degradation semantics as MailService/Storage).

## 2. 基础设施 / 2. Infrastructure

| 项 / Item | 说明 / Description |
|----|------|
| 依赖 / Dependencies | ioredis、@nestjs/cache-manager、cache-manager、cache-manager-ioredis-yet |
| docker-compose | `redis:7-alpine` 服务（端口 6379，healthcheck）；server 容器带 `REDIS_URL=redis://redis:6379` / `redis:7-alpine` service (port 6379, healthcheck); the server container carries `REDIS_URL=redis://redis:6379` |
| 配置 / Config | `REDIS_URL`（默认 redis://localhost:6379）、`CACHE_ENABLED`（bool 默认 true）、`CACHE_TTL`（默认 300s） / `REDIS_URL` (default redis://localhost:6379), `CACHE_ENABLED` (bool, default true), `CACHE_TTL` (default 300s) |

## 3. CacheService / 3. CacheService

`src/common/cache/cache.service.ts`：
- `get<T>(key)` / `set(key, value, ttlMs)` / `delete(key)` / `delByPrefix(prefix)`
- `enabled` getter（CACHE_ENABLED）
  `enabled` getter (CACHE_ENABLED)
- 降级：Redis 异常吞掉记 warn，返回 undefined（穿透直查库）
  Degradation: Redis exceptions are swallowed and logged as warn, returning undefined (fall-through to direct DB query)
- 穿透防护：`set` 跳过 null 值
  Fall-through protection: `set` skips null values
- `delByPrefix`：用 ioredis client `keys` + `del` 批量删（cache-manager 无原生前缀删除）
  `delByPrefix`: batch-deletes with the ioredis client `keys` + `del` (cache-manager has no native prefix deletion)

## 4. 缓存点 / 4. Cache Points

| 缓存点 / Cache point | key | TTL | 失效 / Invalidation |
|--------|-----|-----|------|
| users.findOne | `user:{id}` | 300s | update/remove/updateRole 删 `user:{id}` / update/remove/updateRole delete `user:{id}` |
| events.findAll | `events:list:{page}:{limit}` | 60s | create/update/remove 删 `events:*` 前缀 / create/update/remove delete the `events:*` prefix |
| events.search | `events:search:{userId}:{keyword}:{page}:{limit}:{start}:{end}` | 60s | 同上 / Same as above |
| oauth config | `oauth:config` | 3600s | 无写操作 / No write operations |

## 5. 测试 / 5. Tests

- cache.service.spec 8 用例（get/set/delete/delByPrefix/空值跳过/降级）
  cache.service.spec 8 cases (get/set/delete/delByPrefix / null-value skip / degradation)
- users.service.spec：findOne 缓存命中不查库 + update 清缓存
  users.service.spec: findOne cache hit does not query the DB + update clears the cache
- events.service.spec：search 缓存命中不查库
  events.service.spec: search cache hit does not query the DB
- e2e 环境 `CACHE_ENABLED=false`（.env.test）避免 flaky
  e2e environment uses `CACHE_ENABLED=false` (.env.test) to avoid flakiness

## 6. 后续 / 6. Follow-ups

- 3.2 异步任务队列（BullMQ）—— Redis 已就绪，独立设计
  3.2 Async task queue (BullMQ) — Redis already in place; designed separately
- 3.3 数据库读写分离 —— 依赖生产 PostgreSQL
  3.3 Database read/write splitting — depends on production PostgreSQL
