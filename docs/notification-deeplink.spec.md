# 通知深链跳转 — NotificationDeepLink（MS-5）

## 1. 概述

站内通知此前仅有非结构化 `link` 文本字段，前端点击只标记已读、不跳转。本功能为通知增加结构化 `targetType` / `targetId` 字段，前端点击通知后按类型路由跳转到对应业务页（事件/对话/待办）。

## 2. 需求点

| # | 需求 | 优先级 |
|---|------|--------|
| F1 | 通知带结构化目标（targetType + targetId），由产生方填充 | P0 |
| F2 | 前端点击通知：标记已读 + 跳转目标业务页 | P0 |
| F3 | 无 target / 未知类型通知：仅标记已读，不跳转（不产生报错） | P0 |
| F4 | targetType/targetId 随设备推送 payload 透传（供将来点击通知栏处理） | P1 |

**不在范围**：通知栏点击处理（依赖 MS-2.3 原生推送消费端）、通用路由协议（按需扩展）。

## 3. 数据模型

`Notification` 实体加两列（迁移 `AddNotificationTargets1785986020373`）：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| targetType | VARCHAR(32) | nullable | 目标类型：`event` / `conversation` / `todo`（后续可扩展） |
| targetId | VARCHAR(64) | nullable | 目标 ID（字符串，兼容数字/UUID） |

`link` 字段保留作为可读文本（如 `/events/5`），`targetType/targetId` 是结构化版本，跳转以前者为准。

## 4. 后端

- `CreateNotificationData` 加 `targetType?` / `targetId?`；`create()` 落库 + SSE 透传 + 设备推送透传。
- `_pushToDevices` / `_doPush` / PushProcessor 透传两字段到 `PushPayload.data`。
- 现有产生点填充：
  - ReminderProcessor（事件提醒）→ `targetType: 'event', targetId: String(eventId)`
- SSE `emitToUser` 事件体包含 targetType/targetId（前端实时订阅也能拿到）。

## 5. 前端

- `NotificationModel` 加 `targetType?` / `targetId?`（fromJson 解析 + copyWith 透传）。
- 通知页 `_onTapNotification`：标记已读后按 `targetType` 跳转：

| targetType | 跳转 | 方式 |
|------------|------|------|
| `event` | `/events/:id/edit`（事件编辑页承载详情） | `context.push` |
| `conversation` | `/ai/history`（对话历史） | `context.push` |
| `todo` | `/todos`（待办 tab） | `context.go` |
| 其他/空 | 仅标记已读 | — |

> `context.push` 保留返回栈（通知页 → 业务页 → 可返回），符合页面返回规范。

## 6. 测试

- 后端：
  - notifications.service.spec：create 透传 targetType/targetId 到 repository.create / SSE / push payload
  - reminder.processor.spec：create 断言含 `targetType:'event', targetId:'1'`
  - push.processor.spec：targetType/targetId 透传到 PushPayload.data
- 前端：
  - notification_model_test（新增）：fromJson 解析 target 字段 / 缺省为 null / copyWith 保留

## 7. 后续

- 通知栏点击处理（MS-2.3 原生推送消费端就绪后）
- 更多 targetType（如 `todo`、`user`），路由映射表扩展
