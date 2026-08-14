# Front-Taro 功能同步（PL-6）需求确认书 / Front-Taro Feature Sync (PL-6) Requirements Confirmation

> 需求确认日期：2026-08-06
> Date of requirements confirmation: 2026-08-06
> 状态：已确认
> Status: Confirmed

## 1. 背景与目标 / Background and Goals

主 App 的 Flutter 端已实现 notifications / sessions / search / ai / todos 等能力，但 Front-Taro（主 App 的 H5/小程序端）仅 12 个基础页（auth/events/upload/profile/explore/settings），上述能力均缺失。两端功能差异影响用户一致性。

The Flutter client of the main app already implements capabilities such as notifications / sessions / search / ai / todos, but Front-Taro (the main app's H5 / mini-program client) has only 12 basic pages (auth/events/upload/profile/explore/settings), and all of the above capabilities are missing. This functional gap between the two clients affects user consistency.

**目标**：补齐 Taro 端与 Flutter 一致的基础功能——站内通知中心、多设备会话管理。搜索/AI/待办因 H5/小程序渠道定位不同，按渠道策略评估后本期暂不纳入（见下）。

**Goal**: Bring the Taro client up to parity with Flutter's basic features — in-app notification center and multi-device session management. Search / AI / todos are excluded from this phase because the H5 / mini-program channel is positioned differently; they are evaluated by channel strategy and not included for now (see below).

**不在范围**：

**Out of scope**:

- AI 对话（Taro 端 H5 定位为轻量入口，AI 重交互留 Flutter）
  AI chat (the Taro H5 client is positioned as a lightweight entry point; heavy AI interaction stays in Flutter)
- 全局搜索、待办清单（用户量/交互密度低，后续按需）
  Global search and todo list (low user volume / interaction density; to be added on demand later)
- 通知实时推送（SSE 在 H5 小程序端支持有限，先做进入页面轮询加载）
  Real-time notification push (SSE support is limited on H5 / mini-program clients; start with polling on page entry for now)

## 2. 功能需求 / Functional Requirements

| # | 需求 / Requirement | 说明 / Description | 优先级 / Priority |
|---|------|------|--------|
| F1 | 通知中心 / Notification Center | 消息列表（分页）、未读标记、单条已读、全部已读、删除 / Message list (paginated), unread marker, mark single as read, mark all as read, delete | P0 |
| F2 | 通知入口 / Notification entry | Profile 页/导航入口，未读角标 / Profile page / navigation entry, unread badge | P1 |
| F3 | 会话管理 / Session Management | 登录设备列表（含当前设备标记）、远程登出 / List of signed-in devices (with current-device marker), remote logout | P0 |
| F4 | 会话入口 / Session entry | Settings 页入口 / Settings page entry | P1 |

## 3. 接口前置 / API Prerequisites

- `api-client.ts` 缺 PATCH 方法（通知已读需 `PATCH /notifications/:id/read`）——需补
  `api-client.ts` lacks a PATCH method (marking a notification as read needs `PATCH /notifications/:id/read`) — to be added
- 通知分页：`GET /notifications?page&limit` → `{ items, total, page, limit }`
  Notification pagination: `GET /notifications?page&limit` → `{ items, total, page, limit }`
- 会话：`GET /auth/sessions`（含 isCurrent）、`DELETE /auth/sessions/:id`
  Sessions: `GET /auth/sessions` (includes isCurrent), `DELETE /auth/sessions/:id`

## 4. 非功能需求 / Non-functional Requirements

- 遵循 Taro 端既有模式：service 封装 + zustand store + 页面 TSX + SCSS
  Follow the existing Taro client patterns: service wrapper + zustand store + page TSX + SCSS
- 错误处理：请求失败 toast / 空态
  Error handling: toast on request failure / empty state
- 中英文案与 Flutter 对齐
  Chinese / English copy aligned with Flutter

## 5. 验收标准 / Acceptance Criteria

- 通知页：列表加载、已读/全部已读/删除生效
  Notification page: list loads, mark-read / mark-all-read / delete take effect
- 会话页：设备列表、当前设备标记、远程登出（confirm 弹窗）
  Sessions page: device list, current-device marker, remote logout (confirm dialog)
- `npm run build:h5` 构建通过
  `npm run build:h5` build passes
