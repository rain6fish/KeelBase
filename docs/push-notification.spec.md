# 推送通知（MS-2）功能规格

## 1. 概述

统一推送抽象：`PushService` 接口 + 多 provider（极光 JPush / FCM / APNs）。当前已实现**极光（国内）**与 **Noop（未配置降级）**；FCM/APNs 接口已覆盖，实现待凭据到位后补充。仿 MailService（降级语义）/ StorageModule（工厂切换）模式。

## 2. 接口

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

## 3. Provider

| PUSH_DRIVER | 实现 | 说明 |
|-------------|------|------|
| none（默认） | NoopPushService | 降级日志，不实际发送 |
| jpush | JPushService | 极光 REST API v3，国内 |
| fcm / apns | — | 接口已覆盖，实现待凭据（TODO） |

### 极光（JPush）细节

- API：`POST https://api.jpush.cn/v3/push`
- 认证：`Authorization: Basic base64(appKey:masterSecret)`
- `sendToDevice` → `audience.registration_id`；`sendToTopic` → `audience.tag`
- notification 结构：顶层 `alert`（标题）+ `android {title, alert, extras}` + `ios {alert, extras}`
- 未配置 `JPUSH_APP_KEY`/`JPUSH_MASTER_SECRET` → `enabled=false`，降级 no-op

## 4. 配置

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| PUSH_DRIVER | none | none \| jpush（fcm/apns 预留） |
| JPUSH_APP_KEY | '' | 极光应用标识 |
| JPUSH_MASTER_SECRET | '' | 极光服务端密钥（仅服务端保存） |

凭据获取：极光控制台 →「消息推送」→「推送设置」→「集成设置」。

## 5. 凭据获取指引（FCM/APNs）

- **APNs**：Apple Developer → Keys → 创建 APNs Auth Key（.p8），需 Team ID / Key ID / Bundle ID
- **FCM**：Firebase 控制台 → 项目设置 → 服务账号 → 生成私钥（.json）
- 拿到后实现 `FcmService`/`ApnsService` 并在 PushModule useFactory 分支即可

## 6. 设备 token 注册表（MS-2.1）

`push_tokens` 表：`id, userId, deviceId?, platform, token(唯一), createdAt`，index userId+platform。

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | /api/v1/push/tokens | 登录 | 注册/更新设备 token（按 userId+token upsert） |
| DELETE | /api/v1/push/tokens/:token | 登录 | 注销设备 token |

body：`{ platform: android\|ios\|web, token, deviceId? }`。

### 通知触发推送

`NotificationsService.create()`：DB 落库 → SSE emitToUser → 查该用户全部 token → `pushService.sendToDevice(token, { title, body, data: { type, link } })`。推送失败不阻断通知创建（catch 日志；未配置/无 token 天然降级）。

## 7. 测试

- 后端单测：jpush.service.spec 4 用例、push.module.spec 3 用例、push-token.service.spec 4 用例、notifications.service.spec 4 个 create 推送用例
- 后端 e2e：PushModule 加载 + push token 注册/upsert/注销 3 用例

## 8. 后续

- 事件提醒定时推送（依赖 3.2 异步任务队列）
- FCM/APNs 实现（MS-2.2，待凭据）
