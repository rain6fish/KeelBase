# Front-Taro 功能同步（PL-6）需求确认书

> 需求确认日期：2026-08-06
> 状态：已确认

## 1. 背景与目标

主 App 的 Flutter 端已实现 notifications / sessions / search / ai / todos 等能力，但 Front-Taro（主 App 的 H5/小程序端）仅 12 个基础页（auth/events/upload/profile/explore/settings），上述能力均缺失。两端功能差异影响用户一致性。

**目标**：补齐 Taro 端与 Flutter 一致的基础功能——站内通知中心、多设备会话管理。搜索/AI/待办因 H5/小程序渠道定位不同，按渠道策略评估后本期暂不纳入（见下）。

**不在范围**：
- AI 对话（Taro 端 H5 定位为轻量入口，AI 重交互留 Flutter）
- 全局搜索、待办清单（用户量/交互密度低，后续按需）
- 通知实时推送（SSE 在 H5 小程序端支持有限，先做进入页面轮询加载）

## 2. 功能需求

| # | 需求 | 说明 | 优先级 |
|---|------|------|--------|
| F1 | 通知中心 | 消息列表（分页）、未读标记、单条已读、全部已读、删除 | P0 |
| F2 | 通知入口 | Profile 页/导航入口，未读角标 | P1 |
| F3 | 会话管理 | 登录设备列表（含当前设备标记）、远程登出 | P0 |
| F4 | 会话入口 | Settings 页入口 | P1 |

## 3. 接口前置

- `api-client.ts` 缺 PATCH 方法（通知已读需 `PATCH /notifications/:id/read`）——需补
- 通知分页：`GET /notifications?page&limit` → `{ items, total, page, limit }`
- 会话：`GET /auth/sessions`（含 isCurrent）、`DELETE /auth/sessions/:id`

## 4. 非功能需求

- 遵循 Taro 端既有模式：service 封装 + zustand store + 页面 TSX + SCSS
- 错误处理：请求失败 toast / 空态
- 中英文案与 Flutter 对齐

## 5. 验收标准

- 通知页：列表加载、已读/全部已读/删除生效
- 会话页：设备列表、当前设备标记、远程登出（confirm 弹窗）
- `npm run build:h5` 构建通过
