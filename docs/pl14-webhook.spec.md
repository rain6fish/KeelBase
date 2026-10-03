# PL-14 开放平台 Webhook 订阅投递 — 功能规格说明 (Spec) / PL-14 Open-Platform Webhook Delivery — Functional Specification

> 版本：v1.0
> Version: v1.0

> 基于：平台通用能力（Webhook 订阅）
> Based on: "PL platform capabilities" section of the private roadmap

> 关联项目：KeelBase（App 全栈开发平台）
> Related project: KeelBase (App full-stack development platform)

---

## 1. 概述 / 1. Overview

### 1.1 功能目标 / 1.1 Feature Goals

给平台提供 **Webhook 订阅投递**——用户为平台事件（如用户反馈）注册回调 URL，事件发生时服务端**在该请求内**以 **HMAC-SHA256 签名**投递到回调地址，供第三方应用集成（开放平台生态化第一步）。

Provide **Webhook subscription & delivery** — users register callback URLs for platform events (e.g. user feedback); on event, the server delivers to the callback **within the same request**, signed with **HMAC-SHA256**, for third-party integration (first step of open-platform ecosystem).

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

事件发生时（现有三个触发点：`feedback.created` / `todo.created` / `event.created`），对每个**启用且订阅了该事件**的 webhook：

When an event occurs (three triggers today: `feedback.created` / `todo.created` / `event.created`), for each **enabled webhook subscribed to that event**:

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
- **投递**：`fetch` POST，**单次 3 秒超时**；**失败按退避重试（默认 2 次：1s 间隔，可配置）**；**对多个匹配订阅并发投递**。**投递在该请求内进行**，故业务响应会等它 —— 最坏耗时 ≈ **单个订阅**的最坏值（默认 ≈7s），**不随订阅数增长**。重试耗尽仅记日志（并走告警通道），**不使业务操作失败**。
  **Delivery**: `fetch` POST with a **3s per-attempt timeout**; **backoff retry on failure (default 2 attempts, 1s interval, configurable)**; **delivered concurrently across all matching subscriptions**. Delivery runs **inside the same request**, so the business response waits — worst case ≈ a **single** subscription's worst case (≈7s by default), **not multiplied by the number of subscriptions**. After exhaustion it is only logged (plus the alert channel) and does not fail the business operation.

---

## 5. 业务规则 / 5. Business Rules

1. **本人管理**：订阅/查询/删除均以 userId 限定，无法操作他人订阅。
   **Self-managed**: all operations scoped to userId.
2. **secret 保密**：仅服务端存储，接口视图不返回。
   **Secret confidentiality**: server-only, never returned.
3. **触发扩展**：业务 service 用 `@Optional() WebhookPublisher` 注入，调 `publish(eventType, payload)`；未注入（降级/测试）时静默跳过。
   **Trigger extension**: business services inject `@Optional() WebhookPublisher` and call `publish(eventType, payload)`; absent (degraded/test) → silently skipped.
4. **性能**：事件发布前查匹配订阅，低量；**投递在该请求内、对多订阅并发** —— 单次超时 3s、默认重试 2 次 ⇒ 最坏 ≈7s，且**不随订阅数增长**。
   **Perf**: one match query per event, low volume; delivery is **in-request and concurrent across subscriptions** — 3s per-attempt timeout, 2 attempts by default ⇒ ≈7s worst case, **not growing with the subscription count**.

---

## 6. 局限 / 6. Limitations

- 三个真实触发点：`feedback.created`（用户反馈）+ `todo.created`（待办创建）+ `event.created`（事件创建）。
  Three live triggers: `feedback.created` (user feedback) + `todo.created` (todo creation) + `event.created` (event creation).
- 无重试队列 —— 投递在请求内**尽力**完成，失败仅记日志 + 告警。**改接 BullMQ 队列**是实现「真非阻塞 + durable 重试」的正解，**已登记为待办**。
  No retry queue — delivery is **best-effort inside the request**; failures are logged plus alerted. **Moving it onto a BullMQ queue** is the way to real non-blocking durable retry, and is **registered as a pending item**.
- URL 校验要求 https（`class-validator @IsUrl`），回调接收方需 TLS。
  URL must be https (`@IsUrl`), receiver needs TLS.

---

## 7. 测试 / 7. Tests

- `webhook.service.spec.ts`：subscribe 生成 secret / list 视图脱敏 / remove 本人限定 / publish 只投递启用+匹配订阅且带 HMAC 签名 / **多订阅并发投递** / 事件不匹配不投递 / **投递失败不抛异常并走上报通道（REL-2）** / testDeliver。
- feedback spec 回归（`@Optional` 不破坏现有测试）。
- 全量：webhook + feedback 用例**全部通过**（条数以当次 `npm test` 为准，别拿固定条数对账）。
