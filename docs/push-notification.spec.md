# 推送通知（MS-2）功能规格 / Push Notifications (MS-2) Feature Specification

## 1. 概述 / Overview

统一推送抽象：`PushService` 接口 + 多 provider（极光 JPush / FCM / APNs）。当前已实现**极光（国内）**与 **Noop（未配置降级）**；FCM/APNs 接口已覆盖，实现待凭据到位后补充。仿 MailService（降级语义）/ StorageModule（工厂切换）模式。

Unified push abstraction: a `PushService` interface + multiple providers (Aurora JPush / FCM / APNs). Currently **Aurora (domestic)** and **Noop (fallback when unconfigured)** are implemented; the FCM/APNs interfaces are covered, with implementations to be added once credentials are in place. It follows the MailService (degradation semantics) / StorageModule (factory switching) patterns.

## 2. 接口 / Interface

```typescript
export const PUSH_SERVICE = 'PUSH_SERVICE';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;  // 自定义数据（跳转/业务字段）
}

interface PushService {
  sendToDevice(deviceToken: string, payload: PushPayload): Promise<void>;
  sendToTopic(topic: string, payload: PushPayload): Promise<void>;
}
```

## 3. Provider / Providers

| PUSH_DRIVER | 实现 / Implementation | 说明 / Description |
|-------------|------|------|
| none（默认） | NoopPushService | 降级日志，不实际发送 / Degraded logging, does not actually send |
| jpush | JPushService | 极光 REST API v3，国内 / Aurora REST API v3, domestic |
| fcm / apns | — | 接口已覆盖，实现待凭据（TODO）/ Interface covered, implementation pending credentials (TODO) |

### 极光（JPush）细节 / Aurora (JPush) Details

- API：`POST https://api.jpush.cn/v3/push`
  API: `POST https://api.jpush.cn/v3/push`
- 认证：`Authorization: Basic base64(appKey:masterSecret)`
  Auth: `Authorization: Basic base64(appKey:masterSecret)`
- `sendToDevice` → `audience.registration_id`；`sendToTopic` → `audience.tag`
  `sendToDevice` → `audience.registration_id`; `sendToTopic` → `audience.tag`
- notification 结构：顶层 `alert`（标题）+ `android {title, alert, extras}` + `ios {alert, extras}`
  notification structure: top-level `alert` (title) + `android {title, alert, extras}` + `ios {alert, extras}`
- 未配置 `JPUSH_APP_KEY`/`JPUSH_MASTER_SECRET` → `enabled=false`，降级 no-op
  When `JPUSH_APP_KEY`/`JPUSH_MASTER_SECRET` are not configured → `enabled=false`, degrades to no-op

## 4. 配置 / Configuration

| 环境变量 / Env Var | 默认 / Default | 说明 / Description |
|----------|------|------|
| PUSH_DRIVER | none | none \| jpush（fcm/apns 预留）/ none \| jpush (fcm/apns reserved) |
| JPUSH_APP_KEY | '' | 极光应用标识 / Aurora app identifier |
| JPUSH_MASTER_SECRET | '' | 极光服务端密钥（仅服务端保存）/ Aurora server-side secret (kept server-side only) |

凭据获取：极光控制台 →「消息推送」→「推送设置」→「集成设置」。

Credential acquisition: Aurora console → "Message Push" → "Push Settings" → "Integration Settings".

## 5. 凭据获取指引（FCM/APNs）/ Credential Acquisition Guide (FCM/APNs)

- **APNs**：Apple Developer → Keys → 创建 APNs Auth Key（.p8），需 Team ID / Key ID / Bundle ID
  **APNs**: Apple Developer → Keys → create an APNs Auth Key (.p8); requires Team ID / Key ID / Bundle ID
- **FCM**：Firebase 控制台 → 项目设置 → 服务账号 → 生成私钥（.json）
  **FCM**: Firebase console → Project settings → Service accounts → generate a private key (.json)
- 拿到后实现 `FcmService`/`ApnsService` 并在 PushModule useFactory 分支即可
  Once obtained, implement `FcmService`/`ApnsService` and add them to the PushModule useFactory branches

## 6. 设备 token 注册表（MS-2.1）/ Device Token Registry (MS-2.1)

`push_tokens` 表：`id, userId, deviceId?, platform, token(唯一), createdAt`，index userId+platform。

The `push_tokens` table: `id, userId, deviceId?, platform, token(unique), createdAt`, indexed on userId+platform.

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | /api/v1/push/tokens | 登录 | 注册/更新设备 token（按 userId+token upsert）/ Register/update a device token (upsert by userId+token) |
| DELETE | /api/v1/push/tokens/:token | 登录 | 注销设备 token / Unregister a device token |

body：`{ platform: android\|ios\|web, token, deviceId? }`。

body: `{ platform: android|ios|web, token, deviceId? }`.

### 通知触发推送 / Notification-Triggered Push

`NotificationsService.create()`：DB 落库 → SSE emitToUser → 查该用户全部 token → `pushService.sendToDevice(token, { title, body, data: { type, link } })`。推送失败不阻断通知创建（catch 日志；未配置/无 token 天然降级）。

`NotificationsService.create()`: persist to DB → SSE emitToUser → query all tokens for that user → `pushService.sendToDevice(token, { title, body, data: { type, link } })`. Push failure does not block notification creation (catch + log; naturally degrades when unconfigured or when there are no tokens).

## 7. 测试 / Tests

- 后端单测：jpush.service.spec 4 用例、push.module.spec 3 用例、push-token.service.spec 4 用例、notifications.service.spec 4 个 create 推送用例
  Backend unit tests: jpush.service.spec 4 cases, push.module.spec 3 cases, push-token.service.spec 4 cases, notifications.service.spec 4 create-push cases
- 后端 e2e：PushModule 加载 + push token 注册/upsert/注销 3 用例
  Backend e2e: PushModule loading + push token register/upsert/unregister 3 cases

## 8. 后续 / Next Steps

- 事件提醒定时推送（依赖 3.2 异步任务队列）
  Scheduled push for event reminders (depends on the 3.2 async task queue)
- FCM/APNs 实现（MS-2.2，待凭据）
  FCM/APNs implementation (MS-2.2, pending credentials)
