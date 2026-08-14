# Front-Taro 功能同步 — FrontTaroSync（PL-6） / Front-Taro Feature Sync — FrontTaroSync (PL-6)

## 1. 概述 / Overview

将 Flutter 端已实现的「站内通知中心」「多设备会话管理」同步到 Front-Taro（主 App H5/小程序端），保持两端基础能力一致。遵循 Taro 既有分层：`services/`（API 封装）+ `stores/`（zustand）+ `pages/*/index.tsx`（页面）。

Sync the "in-app notification center" and "multi-device session management" already implemented on the Flutter client to Front-Taro (the main app's H5 / mini-program client), keeping the two clients' basic capabilities consistent. Follow Taro's existing layering: `services/` (API wrapper) + `stores/` (zustand) + `pages/*/index.tsx` (pages).

## 2. 接口补充 / API Additions

`src/services/api-client.ts` 新增 `patch` 方法（通知已读用）：

Add a `patch` method to `src/services/api-client.ts` (used for marking notifications as read):

```typescript
patch<T = any>(path: string, data?: any): Promise<ApiResponse<T>> {
  return request<T>('PATCH', path, data)
}
```

`request` 的 method 类型放宽为 `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'`。

The method type of `request` is widened to `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'`.

## 3. 通知中心（notifications） / Notification Center (notifications)

### 类型（`src/types/notification.ts`） / Types (`src/types/notification.ts`)

```typescript
export interface NotificationItem {
  id: number
  title: string
  body?: string
  type: string
  isRead: boolean
  createdAt?: string
}
```

### 服务（`src/services/notification-service.ts`） / Service (`src/services/notification-service.ts`)

| 方法 / Method | 调用 / Call |
|------|------|
| `getNotifications(page, limit)` | GET /notifications |
| `getUnreadCount()` | GET /notifications/unread-count |
| `markRead(id)` | PATCH /notifications/:id/read |
| `markAllRead()` | PATCH /notifications/read-all |
| `deleteNotification(id)` | DELETE /notifications/:id |

### Store（`src/stores/notification-store.ts`） / Store (`src/stores/notification-store.ts`)

`useNotificationStore`：`notifications / unreadCount / isLoading / hasMore / load / loadMore / markRead / markAllRead / remove`。进入页面时 `load()` 拉第一页 + 未读数。

`useNotificationStore`: `notifications / unreadCount / isLoading / hasMore / load / loadMore / markRead / markAllRead / remove`. On page entry, `load()` fetches the first page plus the unread count.

### 页面（`src/pages/notifications/index.tsx` + scss） / Page (`src/pages/notifications/index.tsx` + scss)

- 列表：标题 + 正文 + 未读圆点 + 时间 + 已读/删除操作
  List: title + body + unread dot + time + mark-read / delete actions
- 底部「全部已读」按钮；单项长按/按钮删除（Taro `showModal` 确认）
  "Mark all as read" button at the bottom; delete a single item via long-press / button (confirmed with Taro `showModal`)
- 空态 / 加载态
  Empty state / loading state
- 未读角标：Profile 入口显示 `unreadCount`
  Unread badge: the Profile entry shows `unreadCount`

## 4. 会话管理（sessions） / Session Management (sessions)

### 类型（`src/types/session.ts`） / Types (`src/types/session.ts`)

```typescript
export interface SessionItem {
  id: number
  deviceId?: string
  deviceName?: string
  ip?: string
  createdAt?: string
  lastActiveAt?: string
  expiresAt?: string
  isCurrent: boolean
}
```

### 服务（`src/services/session-service.ts`） / Service (`src/services/session-service.ts`)

| 方法 / Method | 调用 / Call |
|------|------|
| `getSessions()` | GET /auth/sessions（后端传 `x-device-id` 头识别当前设备）/ GET /auth/sessions (the backend identifies the current device via the `x-device-id` header) |
| `revokeSession(id)` | DELETE /auth/sessions/:id |

### Store（`src/stores/session-store.ts`） / Store (`src/stores/session-store.ts`)

`useSessionStore`：`sessions / isLoading / load / revoke`。

`useSessionStore`: `sessions / isLoading / load / revoke`.

### 页面（`src/pages/sessions/index.tsx` + scss） / Page (`src/pages/sessions/index.tsx` + scss)

- 设备列表：设备名 + IP + 最后活跃时间；`isCurrent` 标记「当前设备」
  Device list: device name + IP + last active time; `isCurrent` marks the "current device"
- 远程登出：Taro `showModal` 确认 → revoke → 列表刷新
  Remote logout: confirmed via Taro `showModal` → revoke → list refresh
- 空态
  Empty state

## 5. 入口 / Entry Points

- Profile 页菜单加「Notifications」（🔔）+「Login Devices」（📱）
  Add "Notifications" (🔔) + "Login Devices" (📱) to the Profile page menu
- Settings 页「Account」区加「Login Devices」入口（跳 `/pages/sessions/index`）
  Add a "Login Devices" entry to the "Account" section of the Settings page (navigates to `/pages/sessions/index`)
- `app.config.ts` 注册两个新页面
  Register the two new pages in `app.config.ts`

## 6. 渠道策略说明（本期不做） / Channel Strategy Notes (Not in This Phase)

- AI 对话 / 全局搜索 / 待办清单：H5 小程序端为轻量渠道，重交互留 Flutter，按需再同步
  AI chat / global search / todo list: the H5 mini-program client is a lightweight channel; heavy interaction stays in Flutter and will be synced on demand
- 通知实时推送：SSE 在 H5 小程序支持有限，页面内轮询加载（进入时 `load()`）
  Real-time notification push: SSE support is limited on H5 mini-program; use in-page polling (call `load()` on entry)

## 7. 测试 / 验证 / Testing / Verification

- 无前端单测基建（Taro 项目未配 jest）——通过 `npm run build:h5` 构建通过 + 手动核对
  No frontend unit-test infrastructure (the Taro project has no jest configured) — verified via `npm run build:h5` passing + manual checks
- 与后端联调：通知列表/已读/删除、会话列表/远程登出
  Integration with the backend: notification list / mark-read / delete, session list / remote logout
