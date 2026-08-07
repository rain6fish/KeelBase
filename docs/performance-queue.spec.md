# 异步任务队列（Phase 3.2）功能规格

## 1. 概述

引入 BullMQ 异步任务队列，把耗时操作（设备推送）从请求线程剥离。依赖 Phase 3.1 的 Redis 基础设施（复用 `REDIS_URL`）。当前队列化：**通知设备推送**（响应语义不变，去掉 `_pushToDevices` 阻塞延迟）。AI 耗时推理 / insights 聚合队列化标注后续。

## 2. 基础设施

| 项 | 说明 |
|----|------|
| 依赖 | bullmq、@nestjs/bullmq（ioredis 已在 Phase 3.1） |
| 配置 | `QUEUE_ENABLED`（bool 默认 true）——false 时降级同步执行（同 MailService 降级语义） |
| 连接 | BullModule.forRootAsync 用 ConfigService 的 REDIS_URL |

## 3. push 队列

- **QueueModule**：提供 `push` 队列（生产者注入 `@InjectQueue('push')`）
- **PushWorkerModule**：注册 `PushProcessor`（`@Processor('push')` + WorkerHost）——**仅生产 app.module 引入**，测试环境不引入避免 worker 连 Redis 挂起
- **PushProcessor.process(job)**：查用户 token → 逐个 `sendToDevice`（错误 catch 记 warn）

### 生产端（NotificationsService）

`_pushToDevices()`：
- `QUEUE_ENABLED && pushQueue` 可用 → `queue.add('send', {userId,title,body,type,link}, {removeOnComplete:true})` 立即返回
- 否则（禁用 / 无 Queue）→ 同步执行 `_doPush`（同 PushProcessor 逻辑）

`@InjectQueue('push')` 用 `@Optional()`——测试环境无 QueueModule 时注入 null 走降级。

## 4. 测试

- push.processor.spec 4 用例（多 token 推送 / 无 token 跳过 / 单 token 失败吞掉 / token 查询失败吞掉）
- notifications.service.spec：适配 Queue + ConfigService mock；队列启用时入队而非同步推
- 单测/e2e 均 `QUEUE_ENABLED=false`（.env.test）走降级路径，无需 Redis
- **test:e2e 加 `--forceExit`**（Queue/ioredis 句柄使 jest 不退出，残留锁 DB）

## 5. 后续

- AI 耗时推理队列化（chat 需前端改造轮询/SSE，风险最高，标注后续）
- insights 聚合队列化（若引入 LLM 摘要才值得）
- 事件提醒定时推送（BullMQ 支持 delayed job）
