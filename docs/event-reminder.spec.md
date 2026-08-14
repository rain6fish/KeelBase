# 事件提醒定时推送 — EventReminder / Event Reminder Scheduled Push — EventReminder

## 1. 概述 / Overview

用户可为事件设置提醒，到时间通过站内通知 + 设备推送触达。基于 Phase 3.2 BullMQ **delayed job**（`queue.add` 原生支持 `delay`），Redis 存储延迟任务，进程重启不丢。

Users can set reminders for events; at the scheduled time they are reached via in-app notification + device push. Based on Phase 3.2 BullMQ **delayed jobs** (`queue.add` natively supports `delay`), Redis stores the delayed tasks, so they survive process restarts.

## 2. 数据模型 / Data Model

Event 实体加 `reminderMinutes`（int nullable，提前 N 分钟提醒；null 不提醒），迁移 `AddEventReminder`。

The Event entity adds `reminderMinutes` (int nullable; remind N minutes ahead; null means no reminder), migration `AddEventReminder`.

## 3. 调度模型 / Scheduling Model

| 环节 / Stage | 说明 / Description |
|------|------|
| 生产者 / Producer | EventsService.create/update：`reminderMinutes` 有值且提醒时间未过 → `reminderQueue.add('event-remind', {eventId,userId}, { delay, jobId: 'event-remind-{id}', removeOnComplete })` / EventsService.create/update: when `reminderMinutes` is set and the reminder time has not passed → `reminderQueue.add('event-remind', {eventId,userId}, { delay, jobId: 'event-remind-{id}', removeOnComplete })` |
| jobId | 同事件多次 create/update 覆盖旧 job（不重复提醒） / Multiple create/update calls for the same event overwrite the old job (no duplicate reminders) |
| 消费端 / Consumer | ReminderProcessor（@Processor('reminder') + WorkerHost）：查事件 → 校验未取消 & 属主 → `NotificationsService.create(userId, {title:'事件提醒', body, type:'reminder', link:'/events/:id'})`（自动触发 SSE + 设备推送） / ReminderProcessor (@Processor('reminder') + WorkerHost): look up the event → verify it is not cancelled & belongs to the owner → `NotificationsService.create(userId, {title:'事件提醒', body, type:'reminder', link:'/events/:id'})` (automatically triggers SSE + device push) |
| 删除 / Delete | EventsService.remove 时 `reminderQueue.remove('event-remind-{id}')` / On EventsService.remove, `reminderQueue.remove('event-remind-{id}')` |
| 降级 / Degradation | QUEUE_ENABLED=false 或队列不可用（@Optional）→ 跳过调度，提醒不生效但业务正常 / QUEUE_ENABLED=false or the queue is unavailable (@Optional) → skip scheduling; reminders don't fire but the business functions normally |

## 4. 前端 / Frontend

- EventModel 加 `reminderMinutes?`
  Add `reminderMinutes?` to EventModel
- 事件表单加「提醒」选择器（ActionSheet 单选：不提醒 / 提前 5 分钟 / 30 分钟 / 1 小时 / 1 天），保存 payload 带 reminderMinutes
  Add a "Reminder" selector to the event form (ActionSheet single-choice: no reminder / 5 minutes ahead / 30 minutes / 1 hour / 1 day); the saved payload carries reminderMinutes
- 编辑时回填当前提醒设置
  Prefill the current reminder setting when editing

## 5. 测试 / Testing

- reminder.processor.spec 5 用例（到点建通知 / 已取消跳过 / 非属主跳过 / 事件不存在跳过 / 查询错误吞掉）
  reminder.processor.spec 5 cases (create notification at the scheduled time / skip if cancelled / skip if not the owner / skip if the event doesn't exist / swallow query errors)
- events.service.spec：create 调度断言（reminderMinutes 有值 → add 带 jobId/delay；无值 → 不调度）
  events.service.spec: create scheduling assertions (reminderMinutes set → add with jobId/delay; unset → no scheduling)
- e2e 全绿（无 Redis 环境降级路径）
  e2e all green (degradation path in environments without Redis)

## 6. 后续 / Future Work

- 提醒策略扩展（自定义分钟数、重复事件提醒）
  Extend reminder policies (custom minutes, recurring event reminders)
- 事件取消时同步移除提醒 job（当前 update 覆盖，取消可手动更新）
  Remove the reminder job when an event is cancelled (currently update overwrites it; cancellation can be updated manually)
