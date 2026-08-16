# RG-6 WebSocket 双向通道 — 功能规格说明 (Spec) / RG-6 WebSocket Realtime Channel — Functional Specification

> 版本：v1.0 / Version: v1.0
> 基于：docs/ws-realtime-requirements.md（需求确认书）
> 关联项目：KeelBase（App 全栈开发平台）

---

## 1. 概述 / 1. Overview

### 1.1 功能目标 / 1.1 Feature Goals

为基座提供一条**标准 WebSocket 双向长连接通道**（原生 `ws`，RFC 6455），承载通知实时推送与 AI 流式聊天，并预留通用双向消息（IM/协同）。与现有 SSE 并存，前端逐步迁移。

Provide a **standard WebSocket two-way persistent channel** (native `ws`, RFC 6455) carrying realtime notification push and AI streaming chat, with a generic two-way `message` reserved for IM/collaboration. Coexists with the existing SSE; frontends migrate incrementally.

### 1.2 关联 / 1.2 Related

- 现有 SSE：`POST /api/v1/notifications/stream`（保留并存）
- AI 流式：`aiService.chatStream`（async generator，chunk 含 text/tool_call/tool_start/tool_end/confirmation_request/confirmation_decision/done/error）
- 确认流：REST `POST /api/v1/ai/confirmations/:token`（WS 复用）
- 治理：HS-9 治理策略、HS-2 工具权限、HS-3 副作用、HS-11 审计——均在 `chatStream` 内，WS 继承

## 2. 接口规格 / 2. API Specification

| Method | Path | Auth | 说明 Description |
|--------|------|------|------------------|
| WS | `/ws?token=<jwt>` | 握手 JWT | WebSocket 双向通道；握手验证失败以 4401 关闭 |

> 生产部署：WS 需经 WSS（nginx HTTPS 或单容器反代处 TLS 终止后升级）；`nginx.conf` / `nginx.https.conf` 增加 `/ws` 的 proxy（`proxy_pass http://server:3000;` + `Upgrade`/`Connection` 头），见部署章节。

## 3. 信封协议 / 3. Envelope Protocol

每文本帧一个 JSON：`{ "event": string, "data": any }`。

### 3.1 服务端 → 客户端 / Server → Client

| event | data | 说明 |
|------|------|------|
| `connected` | `{ userId, ts }` | 握手成功后首帧，客户端据此重置重连退避 |
| `notification` | 通知对象（id/title/body/type/targetType/targetId/createdAt） | 实时通知推送（与 SSE `event: notification` 同构） |
| `message` | `{ channel?, payload }` | 通用双向消息（为 IM/协同预留） |
| `error` | `{ code, message }` | 协议级错误（如 feature-flag 关闭 / 节流 / 内部错误） |

### 3.2 AI chunk → WS 事件映射 / AI chunk → WS event mapping

| chatStream chunk.type | WS event type | data |
|-----------------------|---------------|------|
| `text` | `ai:text` | 原文 |
| `tool_call` | `ai:tool_call` | 工具调用（含参数） |
| `tool_start` | `ai:tool_start` | 工具开始 |
| `tool_end` | `ai:tool_end` | 工具结束 |
| `confirmation_request` | `ai:confirmation_request` | 含 `token`（客户端据此调 REST confirm） |
| `confirmation_decision` | `ai:confirmation_decision` | 确认结果 |
| `done` | `ai:done` | 流结束（data 含 conversationId） |
| `error` | `ai:error` | 错误 |

### 3.3 客户端 → 服务端 / Client → Server

| event | data | 说明 |
|------|------|------|
| `ai:chat` | `{ message, provider?, model?, conversationId?, images? }` | 发起 AI 流式对话（同 `/chat/stream` body） |
| `ai:abort` | 无 | 中止当前流 |
| `message` | `{ channel?, payload }` | 通用双向消息 |
| `ping` | 无 | 应用层保活（可选；服务端回 `pong`） |

## 4. 连接生命周期 / 4. Connection Lifecycle

1. **握手**：客户端 `new WebSocket('/ws?token=<jwt>')`；网关解析 `request.url` → `JwtService.verifyAsync` → 存 WeakMap（user）。失败 → `close(4401,'Unauthorized')`，不注册。
2. **注册**：`RealtimeService` 把 socket 加入 `Map<number, Set<WebSocket>>`；`handleDisconnect` 移除并终止进行中的 AI 流。
3. **心跳**：连接置 `isAlive=true`，`pong` 复位；每 30s sweep：`isAlive===false → terminate()`，否则置 false 并 `ping()`。
4. **下发**：`emitToUser(userId, type, data)` 仅对 `readyState===OPEN` 发送，JSON 序列化，try/catch 吞错；`broadcast(type,data)` 全量。

## 5. AI 流式 WS 处理 / 5. AI Streaming over WS

收到 `ai:chat`（按 socket 串行）：
1. `featureFlags.isEnabled('ai')` 为 false → `{event:'error', data:{code:'AI_DISABLED',...}}`。
2. 每 socket 节流：`ai:chat` 上限 30/min（sweep 计数器重置）；超限 → `error`。
3. 该 socket 已有流 → 置 abort 并等待终止（last-write-wins）。
4. `for await (const chunk of aiService.chatStream(String(user.sub), req))` → 按 3.2 映射发送；循环检查每 socket `aborted`（`ai:abort`/`handleDisconnect` 置位）`break`。
5. try/catch → `ai:error`；finally 未 abort → `ai:done`。

**确认流**：`chatStream` 在 generator 内 `yield confirmation_request` 后阻塞等待 `confirmationStore.resolve()`；客户端收到 `ai:confirmation_request` 帧 → 展示确认卡 → 调 REST `POST /api/v1/ai/confirmations/:token`（approve/reject）→ generator 自动继续。**无后端 generator 改动。**

## 6. 安全与限制 / 6. Security & Limits

- **继承**（在 `chatStream` 内，WS 自动获得）：每日 AI 限额、HS-2 工具权限门控、HS-9 治理策略、HS-11 审计、工具副作用记录。
- **WS 网关复制**（HTTP 守卫不作用于 WS）：`ai` feature-flag 检查、每 socket `ai:chat` 节流（30/min）。
- 握手鉴权：`JwtService.verifyAsync`（secret `JWT_SECRET`）。
- 注意：query token 可能出现在访问日志；二期短时 WS token 缓解。

## 7. 多实例 / 7. Multi-instance

一期单实例内存注册表（`Map<userId, Set<WebSocket>>`，与现有 SSE 一致）。多实例横向扩展需 Redis pub/sub fan-out（跨实例转发 `emitToUser`/`broadcast`），**二期**。

## 8. 前端接入 / 8. Frontend Integration

- **Flutter**：`web_socket_channel`；`WsClient`（baseUrl → ws/wss + `?token=`、`ping` 20s、pong 超时 30s、指数退避重连 1/2/4/…/30s、`connected` 复位）；`NotificationsProvider` 切 WS（`event=='notification'`，SSE flag 降级）；`AiChatProvider.sendMessage` 发 `ai:chat` 消费 `ai:*` 帧，`confirmation_request` → 确认卡 → REST confirm。
- **Front-Taro**：`Taro.connectSocket`；`ws-client.ts` + `notification-store` 订阅（REST 轮询降级）。
- **Web-Admin-Vue / Web-Admin-React**：原生 WebSocket 单例 + `useRealtime()` / `RealtimeContext`；通知徽标订阅 `notification`；轮询保留。

## 9. 集成点 / 9. Integration Points

- `Server-NestJS/src/main.ts`：`app.useWebSocketAdapter(new WsAdapter(app))`（create 后、enableShutdownHooks 前）。
- `Server-NestJS/src/app.module.ts`：imports `RealtimeModule`。
- `Server-NestJS/src/notifications/notifications.service.ts`：`createImpl` 在 `emitToUser` 后加 `this.realtime.emitToUser(userId,'notification',{...saved})`。
- 新模块 `Server-NestJS/src/realtime/`（types/service/gateway/module）。

## 10. 测试 / 10. Testing

- `realtime.service.spec`：注册/断开清理/无连接 no-op/emitToUser 仅 OPEN 发送。
- `realtime.gateway.spec`：mock WebSocket/JwtService/AiService——坏 token 4401、`ai:chat` 产出映射帧+`ai:done`、`ai:abort` 中断、sweep 清理。
- `test/ws-realtime.e2e-spec`：真连 `ws` 客户端——坏 token 4401、`ai:chat`→`ai:text`+`ai:done`、`notificationsService.create()`→收 `notification` 帧。
