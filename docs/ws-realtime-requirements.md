# RG-6 WebSocket 双向通道 — 需求确认书 / RG-6 WebSocket Realtime Channel — Requirements

> 版本：v1.0 / Version: v1.0
> 基于：私有 roadmap「RG 系列（基座体验与工程化）」RG-6
> 关联项目：KeelBase（App 全栈开发平台）

---

## 1. 背景与目标 / 1. Background & Goals

基座实时通道目前只有 SSE（`POST /api/v1/notifications/stream`，HTTP Response 集合，服务端→客户端**单向**、**无心跳**、无断线重连）。RG-6 补 WebSocket 双向通道，满足实时类应用（IM、协同编辑、AI 流式）对「长连接双向 + 心跳保活 + 断线重连」的需求。

Currently the base platform's only realtime channel is SSE (`POST /api/v1/notifications/stream`, an HTTP-response set, **one-way** server→client, **no heartbeat**, no reconnect). RG-6 adds a WebSocket two-way channel for realtime apps (IM, collaborative editing, AI streaming) needing "persistent two-way connection + heartbeat keepalive + reconnect".

## 2. 范围 / 2. Scope

### 一期（v1）做 / v1 In scope

1. **WS 通道基础设施**：原生 `ws`（@nestjs/platform-ws）网关 `/ws`；握手 JWT 鉴权（query token，失败 4401）；原生 ping/pong 心跳 + 过期连接清理；用户→连接注册表与按用户下发。
2. **通知 WS 化**：`NotificationsService.create()` 同时推 WS `notification` 事件（SSE 保留并存）。
3. **AI 流式 WS 化**：客户端发 `ai:chat` → 服务端把 `aiService.chatStream` async generator 的 chunk 映射为 `ai:*` 事件推回；支持 `ai:abort` 与单 socket 单流；确认流复用现有 REST `POST /ai/confirmations/:token`。
4. **双向 message 能力**：通用 `message` 事件收发，为 IM/协同铺路。
5. **前端四端接入**：Flutter（通知 + AI 流式切 WS）、Front-Taro / Web-Admin-Vue / Web-Admin-React（通知 WS，轮询降级）。

### 一期（v1）不做 / v1 Out of scope

- IM / 协同应用本体（群组/成员/消息收发）——基座只提供通道能力。
- 多实例 Redis pub/sub fan-out（单实例内存注册表，与现有 SSE 一致；二期）。
- WS 上的确认决策端点（确认仍走 REST，客户端从 `ai:confirmation_request` 帧取 token 调 REST）。
- 短时 WS token（query token 日志泄漏缓解，二期）。

## 3. 验收标准 / 3. Acceptance Criteria

- [ ] 浏览器/各端 WS 客户端连 `/ws?token=<jwt>`：合法 token 收到 `connected`；非法 token 连接以 4401 关闭。
- [ ] 空闲连接（无 pong）在约 60s 内被服务端清理。
- [ ] 创建通知后，该用户在线 WS 连接实时收到 `notification` 帧；SSE 通道不受影响。
- [ ] 客户端发 `ai:chat`，收到 `ai:text`（增量）→ `ai:done`；发 `ai:abort` 或断开时流终止。
- [ ] AI 写操作确认：客户端收到 `ai:confirmation_request` → 调 REST confirm → 流继续。
- [ ] 后端 build + 单测 + e2e（含真 WS 连接）全绿；四端 typecheck/lint/test 全绿。

## 4. 安全约束 / 4. Security

- WS 握手必须验证 JWT（`JwtService.verifyAsync`），失败关闭且不注册。
- WS 上的 AI 调用继承 `chatStream` 内的治理（每日限额 / 工具权限 / HS-9 治理策略 / 审计）；`@FeatureFlag('ai')` 与 HTTP 节流是 HTTP 专属，WS 网关需复制 feature-flag 检查 + 每 socket 节流。
- 生产环境 WS 需经 HTTPS/WSS（nginx 或 TSL 终止处升级），见 spec。
