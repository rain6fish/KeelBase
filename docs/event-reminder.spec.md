# 事件提醒定时推送 — EventReminder

## 1. 概述

用户可为事件设置提醒，到时间通过站内通知 + 设备推送触达。基于 Phase 3.2 BullMQ **delayed job**（`queue.add` 原生支持 `delay`），Redis 存储延迟任务，进程重启不丢。

## 2. 数据模型

Event 实体加 `reminderMinutes`（int nullable，提前 N 分钟提醒；null 不提醒），迁移 `AddEventReminder`。

## 3. 调度模型

| 环节 | 说明 |
|------|------|
| 生产者 | EventsService.create/update：`reminderMinutes` 有值且提醒时间未过 → `reminderQueue.add('event-remind', {eventId,userId}, { delay, jobId: 'event-remind-{id}', removeOnComplete })` |
| jobId | 同事件多次 create/update 覆盖旧 job（不重复提醒） |
| 消费端 | ReminderProcessor（@Processor('reminder') + WorkerHost）：查事件 → 校验未取消 & 属主 → `NotificationsService.create(userId, {title:'事件提醒', body, type:'reminder', link:'/events/:id'})`（自动触发 SSE + 设备推送） |
| 删除 | EventsService.remove 时 `reminderQueue.remove('event-remind-{id}')` |
| 降级 | QUEUE_ENABLED=false 或队列不可用（@Optional）→ 跳过调度，提醒不生效但业务正常 |

## 4. 前端

- EventModel 加 `reminderMinutes?`
- 事件表单加「提醒」选择器（ActionSheet 单选：不提醒 / 提前 5 分钟 / 30 分钟 / 1 小时 / 1 天），保存 payload 带 reminderMinutes
- 编辑时回填当前提醒设置

## 5. 测试

- reminder.processor.spec 5 用例（到点建通知 / 已取消跳过 / 非属主跳过 / 事件不存在跳过 / 查询错误吞掉）
- events.service.spec：create 调度断言（reminderMinutes 有值 → add 带 jobId/delay；无值 → 不调度）
- e2e 全绿（无 Redis 环境降级路径）

## 6. 后续

- 提醒策略扩展（自定义分钟数、重复事件提醒）
- 事件取消时同步移除提醒 job（当前 update 覆盖，取消可手动更新）
