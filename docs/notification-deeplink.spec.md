# 通知深链跳转 — NotificationDeepLink（MS-5）/ Notification Deep Link — NotificationDeepLink (MS-5)

## 1. 概述 / 1. Overview

站内通知此前仅有非结构化 `link` 文本字段，前端点击只标记已读、不跳转。本功能为通知增加结构化 `targetType` / `targetId` 字段，前端点击通知后按类型路由跳转到对应业务页（事件/对话/待办）。

In-app notifications previously only had an unstructured `link` text field; tapping in the frontend only marked them read without navigating. This feature adds structured `targetType` / `targetId` fields to notifications, so the frontend routes to the corresponding business page (event / conversation / todo) by type after tapping.

## 2. 需求点 / 2. Requirements

| # | 需求 / Requirement | 优先级 / Priority |
|---|------|--------|
| F1 | 通知带结构化目标（targetType + targetId），由产生方填充 / Notifications carry a structured target (targetType + targetId), filled by the producer | P0 |
| F2 | 前端点击通知：标记已读 + 跳转目标业务页 / Frontend taps a notification: mark as read + navigate to the target business page | P0 |
| F3 | 无 target / 未知类型通知：仅标记已读，不跳转（不产生报错） / Notifications with no target / unknown type: mark as read only, no navigation (no error raised) | P0 |
| F4 | targetType/targetId 随设备推送 payload 透传（供将来点击通知栏处理） / targetType/targetId are passed through in the device push payload (for future notification-bar tap handling) | P1 |

**不在范围**：通知栏点击处理（依赖 MS-2.3 原生推送消费端）、通用路由协议（按需扩展）。

**Out of scope**: notification-bar tap handling (depends on the MS-2.3 native push consumer) and a generic routing protocol (extend on demand).

## 3. 数据模型 / 3. Data Model

`Notification` 实体加两列（迁移 `AddNotificationTargets1785986020373`）：

The `Notification` entity adds two columns (migration `AddNotificationTargets1785986020373`):

| 字段 / Field | 类型 / Type | 约束 / Constraint | 说明 / Description |
|------|------|------|------|
| targetType | VARCHAR(32) | nullable | 目标类型：`event` / `conversation` / `todo`（后续可扩展） / Target type: `event` / `conversation` / `todo` (extensible later) |
| targetId | VARCHAR(64) | nullable | 目标 ID（字符串，兼容数字/UUID） / Target ID (string; compatible with numeric / UUID) |

`link` 字段保留作为可读文本（如 `/events/5`），`targetType/targetId` 是结构化版本，跳转以前者为准。

The `link` field is kept as readable text (e.g. `/events/5`); `targetType/targetId` is the structured version, and navigation relies on it.

## 4. 后端 / 4. Backend

- `CreateNotificationData` 加 `targetType?` / `targetId?`；`create()` 落库 + SSE 透传 + 设备推送透传。
  Add `targetType?` / `targetId?` to `CreateNotificationData`; `create()` persists them and passes them through SSE and device push.
- `_pushToDevices` / `_doPush` / PushProcessor 透传两字段到 `PushPayload.data`。
  `_pushToDevices` / `_doPush` / PushProcessor pass the two fields through to `PushPayload.data`.
- 现有产生点填充：
  Existing producers fill in the target:
  - ReminderProcessor（事件提醒）→ `targetType: 'event', targetId: String(eventId)`
    ReminderProcessor (event reminders) → `targetType: 'event', targetId: String(eventId)`
- SSE `emitToUser` 事件体包含 targetType/targetId（前端实时订阅也能拿到）。
  The SSE `emitToUser` event body includes targetType/targetId (also available to the frontend real-time subscription).

## 5. 前端 / 5. Frontend

- `NotificationModel` 加 `targetType?` / `targetId?`（fromJson 解析 + copyWith 透传）。
  Add `targetType?` / `targetId?` to `NotificationModel` (parsed in fromJson + passed through copyWith).
- 通知页 `_onTapNotification`：标记已读后按 `targetType` 跳转：
  Notification page `_onTapNotification`: mark as read, then navigate by `targetType`:

| targetType | 跳转 / Destination | 方式 / Method |
|------------|------|------|
| `event` | `/events/:id/edit`（事件编辑页承载详情） / `/events/:id/edit` (the event edit page hosts the detail) | `context.push` |
| `conversation` | `/ai/history`（对话历史） / `/ai/history` (conversation history) | `context.push` |
| `todo` | `/todos`（待办 tab） / `/todos` (todos tab) | `context.go` |
| 其他/空 / Other / empty | 仅标记已读 / Mark as read only | — |

> `context.push` 保留返回栈（通知页 → 业务页 → 可返回），符合页面返回规范。
> `context.push` keeps the back stack (notification page → business page → can go back), consistent with the page-back guideline.

## 6. 测试 / 6. Tests

- 后端：
  Backend:
  - notifications.service.spec：create 透传 targetType/targetId 到 repository.create / SSE / push payload
    notifications.service.spec: create passes targetType/targetId through to repository.create / SSE / push payload
  - reminder.processor.spec：create 断言含 `targetType:'event', targetId:'1'`
    reminder.processor.spec: create asserts it contains `targetType:'event', targetId:'1'`
  - push.processor.spec：targetType/targetId 透传到 PushPayload.data
    push.processor.spec: targetType/targetId are passed through to PushPayload.data
- 前端：
  Frontend:
  - notification_model_test（新增）：fromJson 解析 target 字段 / 缺省为 null / copyWith 保留
    notification_model_test (new): fromJson parses the target fields / defaults to null / preserved by copyWith

## 7. 后续 / 7. Follow-ups

- 通知栏点击处理（MS-2.3 原生推送消费端就绪后）
  Notification-bar tap handling (once the MS-2.3 native push consumer is ready)
- 更多 targetType（如 `todo`、`user`），路由映射表扩展
  More targetTypes (e.g. `todo`, `user`); extend the route mapping table
