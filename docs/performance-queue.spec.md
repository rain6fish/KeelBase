# 异步任务队列（Phase 3.2）功能规格 / Async Task Queue (Phase 3.2) Feature Specification

## 1. 概述 / 1. Overview

引入 BullMQ 异步任务队列，把耗时操作（设备推送）从请求线程剥离。依赖 Phase 3.1 的 Redis 基础设施（复用 `REDIS_URL`）。当前队列化：**通知设备推送**（响应语义不变，去掉 `_pushToDevices` 阻塞延迟）。AI 耗时推理 / insights 聚合队列化标注后续。

Introduces a BullMQ async task queue that strips time-consuming operations (device push) off the request thread. Depends on the Phase 3.1 Redis infrastructure (reuses `REDIS_URL`). Currently queued: **notification device push** (response semantics unchanged; removes the `_pushToDevices` blocking delay). AI time-consuming inference / insights aggregation queuing is marked as a follow-up.

## 2. 基础设施 / 2. Infrastructure

| 项 / Item | 说明 / Description |
|----|------|
| 依赖 / Dependencies | bullmq、@nestjs/bullmq（ioredis 已在 Phase 3.1） / bullmq, @nestjs/bullmq (ioredis already added in Phase 3.1) |
| 配置 / Config | `QUEUE_ENABLED`（bool 默认 true）——false 时降级同步执行（同 MailService 降级语义） / `QUEUE_ENABLED` (bool, default true) — when false, degrades to synchronous execution (same degradation semantics as MailService) |
| 连接 / Connection | BullModule.forRootAsync 用 ConfigService 的 REDIS_URL / BullModule.forRootAsync uses the REDIS_URL from ConfigService |

## 3. push 队列 / 3. Push Queue

- **QueueModule**：提供 `push` 队列（生产者注入 `@InjectQueue('push')`）
  **QueueModule**: provides the `push` queue (producers inject `@InjectQueue('push')`)
- **PushWorkerModule**：注册 `PushProcessor`（`@Processor('push')` + WorkerHost）——**仅生产 app.module 引入**，测试环境不引入避免 worker 连 Redis 挂起
  **PushWorkerModule**: registers `PushProcessor` (`@Processor('push')` + WorkerHost) — **only imported in the production app.module**; not imported in the test environment to avoid workers hanging on the Redis connection
- **PushProcessor.process(job)**：查用户 token → 逐个 `sendToDevice`（错误 catch 记 warn）
  **PushProcessor.process(job)**: looks up the user token → calls `sendToDevice` per device (errors caught and logged as warn)

### 生产端（NotificationsService）/ Producer Side (NotificationsService)

`_pushToDevices()`：
- `QUEUE_ENABLED && pushQueue` 可用 → `queue.add('send', {userId,title,body,type,link}, {removeOnComplete:true})` 立即返回
  `QUEUE_ENABLED && pushQueue` available → `queue.add('send', {userId,title,body,type,link}, {removeOnComplete:true})` and return immediately
- 否则（禁用 / 无 Queue）→ 同步执行 `_doPush`（同 PushProcessor 逻辑）
  Otherwise (disabled / no Queue) → run `_doPush` synchronously (same logic as PushProcessor)

`@InjectQueue('push')` 用 `@Optional()`——测试环境无 QueueModule 时注入 null 走降级。

`@InjectQueue('push')` uses `@Optional()` — when there is no QueueModule in the test environment, null is injected and it falls back to degradation.

## 4. 测试 / 4. Tests

- push.processor.spec 4 用例（多 token 推送 / 无 token 跳过 / 单 token 失败吞掉 / token 查询失败吞掉）
  push.processor.spec 4 cases (multi-token push / no-token skip / single-token failure swallowed / token-lookup failure swallowed)
- notifications.service.spec：适配 Queue + ConfigService mock；队列启用时入队而非同步推
  notifications.service.spec: adapts Queue + ConfigService mocks; enqueues rather than pushing synchronously when the queue is enabled
- 单测/e2e 均 `QUEUE_ENABLED=false`（.env.test）走降级路径，无需 Redis
  Both unit tests and e2e use `QUEUE_ENABLED=false` (.env.test) to go through the degradation path; no Redis needed
- **test:e2e 加 `--forceExit`**（Queue/ioredis 句柄使 jest 不退出，残留锁 DB）
  **test:e2e adds `--forceExit`** (Queue/ioredis handles keep jest from exiting, leaving the DB locked)

## 5. 后续 / 5. Follow-ups

- AI 耗时推理队列化（chat 需前端改造轮询/SSE，风险最高，标注后续）
  AI time-consuming inference queuing (chat requires frontend polling/SSE rework; highest risk, marked as a follow-up)
- insights 聚合队列化（若引入 LLM 摘要才值得）
  insights aggregation queuing (only worth it if LLM summarization is introduced)
- 事件提醒定时推送（BullMQ 支持 delayed job）
  Event-reminder scheduled push (BullMQ supports delayed jobs)
