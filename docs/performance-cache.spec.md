# Redis 缓存层（Phase 3.1）功能规格

## 1. 概述

引入 Redis 缓存层，缓存高频读取数据（用户信息、事件列表、OAuth 配置），降低 DB 压力。依赖 `ioredis` + `@nestjs/cache-manager`；**可降级**——`CACHE_ENABLED=false` 或 Redis 不可用时直接查库，不阻塞业务（同 MailService/Storage 降级语义）。

## 2. 基础设施

| 项 | 说明 |
|----|------|
| 依赖 | ioredis、@nestjs/cache-manager、cache-manager、cache-manager-ioredis-yet |
| docker-compose | `redis:7-alpine` 服务（端口 6379，healthcheck）；server 容器带 `REDIS_URL=redis://redis:6379` |
| 配置 | `REDIS_URL`（默认 redis://localhost:6379）、`CACHE_ENABLED`（bool 默认 true）、`CACHE_TTL`（默认 300s） |

## 3. CacheService

`src/common/cache/cache.service.ts`：
- `get<T>(key)` / `set(key, value, ttlMs)` / `delete(key)` / `delByPrefix(prefix)`
- `enabled` getter（CACHE_ENABLED）
- 降级：Redis 异常吞掉记 warn，返回 undefined（穿透直查库）
- 穿透防护：`set` 跳过 null 值
- `delByPrefix`：用 ioredis client `keys` + `del` 批量删（cache-manager 无原生前缀删除）

## 4. 缓存点

| 缓存点 | key | TTL | 失效 |
|--------|-----|-----|------|
| users.findOne | `user:{id}` | 300s | update/remove/updateRole 删 `user:{id}` |
| events.findAll | `events:list:{page}:{limit}` | 60s | create/update/remove 删 `events:*` 前缀 |
| events.search | `events:search:{userId}:{keyword}:{page}:{limit}:{start}:{end}` | 60s | 同上 |
| oauth config | `oauth:config` | 3600s | 无写操作 |

## 5. 测试

- cache.service.spec 8 用例（get/set/delete/delByPrefix/空值跳过/降级）
- users.service.spec：findOne 缓存命中不查库 + update 清缓存
- events.service.spec：search 缓存命中不查库
- e2e 环境 `CACHE_ENABLED=false`（.env.test）避免 flaky

## 6. 后续

- 3.2 异步任务队列（BullMQ）—— Redis 已就绪，独立设计
- 3.3 数据库读写分离 —— 依赖生产 PostgreSQL
