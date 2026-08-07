# Front-Taro 功能同步 — FrontTaroSync（PL-6）

## 1. 概述

将 Flutter 端已实现的「站内通知中心」「多设备会话管理」同步到 Front-Taro（主 App H5/小程序端），保持两端基础能力一致。遵循 Taro 既有分层：`services/`（API 封装）+ `stores/`（zustand）+ `pages/*/index.tsx`（页面）。

## 2. 接口补充

`src/services/api-client.ts` 新增 `patch` 方法（通知已读用）：

```typescript
patch<T = any>(path: string, data?: any): Promise<ApiResponse<T>> {
  return request<T>('PATCH', path, data)
}
```

`request` 的 method 类型放宽为 `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'`。

## 3. 通知中心（notifications）

### 类型（`src/types/notification.ts`）

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

### 服务（`src/services/notification-service.ts`）

| 方法 | 调用 |
|------|------|
| `getNotifications(page, limit)` | GET /notifications |
| `getUnreadCount()` | GET /notifications/unread-count |
| `markRead(id)` | PATCH /notifications/:id/read |
| `markAllRead()` | PATCH /notifications/read-all |
| `deleteNotification(id)` | DELETE /notifications/:id |

### Store（`src/stores/notification-store.ts`）

`useNotificationStore`：`notifications / unreadCount / isLoading / hasMore / load / loadMore / markRead / markAllRead / remove`。进入页面时 `load()` 拉第一页 + 未读数。

### 页面（`src/pages/notifications/index.tsx` + scss）

- 列表：标题 + 正文 + 未读圆点 + 时间 + 已读/删除操作
- 底部「全部已读」按钮；单项长按/按钮删除（Taro `showModal` 确认）
- 空态 / 加载态
- 未读角标：Profile 入口显示 `unreadCount`

## 4. 会话管理（sessions）

### 类型（`src/types/session.ts`）

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

### 服务（`src/services/session-service.ts`）

| 方法 | 调用 |
|------|------|
| `getSessions()` | GET /auth/sessions（后端传 `x-device-id` 头识别当前设备） |
| `revokeSession(id)` | DELETE /auth/sessions/:id |

### Store（`src/stores/session-store.ts`）

`useSessionStore`：`sessions / isLoading / load / revoke`。

### 页面（`src/pages/sessions/index.tsx` + scss）

- 设备列表：设备名 + IP + 最后活跃时间；`isCurrent` 标记「当前设备」
- 远程登出：Taro `showModal` 确认 → revoke → 列表刷新
- 空态

## 5. 入口

- Profile 页菜单加「Notifications」（🔔）+「Login Devices」（📱）
- Settings 页「Account」区加「Login Devices」入口（跳 `/pages/sessions/index`）
- `app.config.ts` 注册两个新页面

## 6. 渠道策略说明（本期不做）

- AI 对话 / 全局搜索 / 待办清单：H5 小程序端为轻量渠道，重交互留 Flutter，按需再同步
- 通知实时推送：SSE 在 H5 小程序支持有限，页面内轮询加载（进入时 `load()`）

## 7. 测试 / 验证

- 无前端单测基建（Taro 项目未配 jest）——通过 `npm run build:h5` 构建通过 + 手动核对
- 与后端联调：通知列表/已读/删除、会话列表/远程登出
