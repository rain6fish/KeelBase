# PL-14 开放平台 Webhook 订阅投递 — 功能规格说明 (Spec) / PL-14 Open-Platform Webhook Delivery — Functional Specification

> 版本：v1.0
> Version: v1.0

> 基于：私有 roadmap「PL 平台通用能力」章节
> Based on: "PL platform capabilities" section of the private roadmap

> 关联项目：KeelBase（App 全栈开发平台）
> Related project: KeelBase (App full-stack development platform)

---

## 1. 概述 / 1. Overview

### 1.1 功能目标 / 1.1 Feature Goals

给平台提供 **Webhook 订阅投递**——用户为平台事件（如用户反馈）注册回调 URL，事件发生时服务端以 **HMAC-SHA256 签名** 异步投递到回调地址，供第三方应用集成（开放平台生态化第一步）。

Provide **Webhook subscription & delivery** — users register callback URLs for platform events (e.g. user feedback); on event, the server asynchronously delivers to the callback with an **HMAC-SHA256 signature** for third-party integration (first step of open-platform ecosystem).

### 1.2 关联需求 / 1.2 Related Requirements

- G-1 应用内反馈（首个事件触发点：`feedback.created`）
- HS-4 headless API Key（开放接口的既有鉴权面）

---

## 2. 数据规格 / 2. Data Specification

新增 `webhook_subscriptions` 表：

New `webhook_subscriptions` table:

| 列 Column | 类型 Type | 说明 Description |
|-----------|----------|------------------|
| `id` | int PK | 自增主键 |
| `user_id` | int | 订阅归属用户（本人管理） |
| `name` | varchar(100) | 订阅名 |
| `url` | varchar(512) | 回调 URL（必须 https） |
| `events` | text(JSON) | 订阅的事件类型白名单，如 `["feedback.created"]` |
| `secret` | varchar(64) | HMAC 签名密钥（hex，仅服务端存储，不对外返回） |
| `enabled` | boolean | 是否启用 |
| `createdAt` | datetime | 创建时间 |

迁移：`AddWebhookSubscriptions`（sqlite + postgres 双驱动）。

---

## 3. 接口规格 / 3. API Specification

| Method | Path | Auth | 说明 Description |
|--------|------|------|------------------|
| POST | `/api/v1/webhooks` | 本人 | 订阅 Webhook（name/url/events，服务端生成 secret） |
| GET | `/api/v1/webhooks` | 本人 | 我的订阅列表（视图不含 secret） |
| PATCH | `/api/v1/webhooks/:id` | 本人 | 启用/停用 |
| DELETE | `/api/v1/webhooks/:id` | 本人 | 删除订阅 |
| POST | `/api/v1/webhooks/test/:id` | 本人 | 测试投递（返回签名与投递结果） |

---

## 4. 投递协议 / 4. Delivery Protocol

事件发生时（当前触发点：`feedback.created`），对每个**启用且订阅了该事件**的 webhook：

When an event occurs (current trigger: `feedback.created`), for each **enabled webhook subscribed to that event**:

```http
POST <url>
Content-Type: application/json
X-Webhook-Event: feedback.created
X-Webhook-Signature: <hmac-sha256-hex>
```

```json
{ "event": "feedback.created", "type": "bug", "userId": "1" }
```

- **签名**：`HMAC-SHA256(secret, rawBody)`，十六进制。接收方可用 secret 验签。
  **Signature**: `HMAC-SHA256(secret, rawBody)` hex. Receivers verify with the secret.
- **投递**：`fetch` POST，5 秒超时；失败仅记日志，**不阻断业务**。
  **Delivery**: `fetch` POST with 5s timeout; failure is logged, **never blocks business**.

---

## 5. 业务规则 / 5. Business Rules

1. **本人管理**：订阅/查询/删除均以 userId 限定，无法操作他人订阅。
   **Self-managed**: all operations scoped to userId.
2. **secret 保密**：仅服务端存储，接口视图不返回。
   **Secret confidentiality**: server-only, never returned.
3. **触发扩展**：业务 service 用 `@Optional() WebhookPublisher` 注入，调 `publish(eventType, payload)`；未注入（降级/测试）时静默跳过。
   **Trigger extension**: business services inject `@Optional() WebhookPublisher` and call `publish(eventType, payload)`; absent (degraded/test) → silently skipped.
4. **性能**：事件发布前查匹配订阅，低量；失败超时 5s 不阻塞。
   **Perf**: match query per event; 5s timeout, non-blocking.

---

## 6. 局限 / 6. Limitations

- 两个真实触发点：`feedback.created`（用户反馈）+ `todo.created`（待办创建）；event 创建等更多事件后续接入。
  Two live triggers: `feedback.created` (user feedback) + `todo.created` (todo creation); more events (event creation) later.
- 无重试队列（投递失败仅记日志）——需要时接 BullMQ 重试。
  No retry queue (failures only logged) — add BullMQ retry when needed.
- URL 校验要求 https（`class-validator @IsUrl`），回调接收方需 TLS。
  URL must be https (`@IsUrl`), receiver needs TLS.

---

## 7. 测试 / 7. Tests

- `webhook.service.spec.ts`：subscribe 生成 secret / list 视图脱敏 / remove 本人限定 / publish 只投递启用+匹配订阅且带 HMAC 签名 / 事件不匹配不投递 / 投递失败静默 / testDeliver（8 用例）。
- feedback spec 回归（`@Optional` 不破坏现有测试）。
- 全量：14 webhook 用例 + feedback 4 用例全绿。
