# 多设备会话管理（AU-3）功能规格

## 1. 概述

支持多设备同时登录，用户可查看已登录设备列表并远程登出。会话（refresh token）从 User 单列迁移为独立 `user_sessions` 表，每设备一行。

## 2. 数据模型

`user_sessions` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | 会话 ID |
| userId | int (index) | 所属用户 |
| refreshHash | varchar(64) | refresh token 的 SHA-256 hash（权威凭据） |
| deviceId | varchar(64) | 设备标识（X-Device-Id 头） |
| deviceName | varchar(128) | 设备名（登录时前端传入） |
| userAgent | varchar(255) | 浏览器 UA |
| ip | varchar(64) | 登录 IP |
| createdAt / lastActiveAt / expiresAt | datetime | 创建 / 最后活跃 / 过期（7 天） |

`User.refreshTokenHash` 单列保留（兼容），refresh/logout 主路径走会话表。

## 3. API 规格

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | /api/v1/auth/login | 公开 | 登录并登记会话行（读 X-Device-Id + body deviceName + IP） |
| POST | /api/v1/auth/register | 公开 | 注册并登记会话行 |
| POST | /api/v1/auth/oauth | 公开 | OAuth 登录并登记会话行 |
| POST | /api/v1/auth/refresh | 公开 | 按 refreshHash 查会话行校验 + 轮换（更新会话 hash 与活跃时间） |
| POST | /api/v1/auth/logout | 登录 | 登出**当前设备**（按 deviceId 删会话行）；无 deviceId 时清全部 |
| GET | /api/v1/auth/sessions | 登录 | 当前用户会话列表（含 isCurrent 标记，读 X-Device-Id） |
| DELETE | /api/v1/auth/sessions/:id | 登录 | 远程登出指定会话（本人所有权） |

### 会话列表响应

```json
{
  "data": [
    {
      "id": 1, "deviceId": "dev-1", "deviceName": "Windows",
      "ip": "1.1.1.1", "lastActiveAt": "2026-08-05T...",
      "expiresAt": "2026-08-12T...", "isCurrent": true
    }
  ]
}
```

## 4. 业务规则

| 规则 | 说明 |
|------|------|
| 多设备 | 每次登录登记独立会话行，互不覆盖 |
| refresh 校验 | 按 refreshHash 查会话行；用户 ID 不符 → 撤销该用户全部会话（防泄露） |
| 轮换 | refresh 成功后更新该会话行的 hash + lastActiveAt |
| 登出语义 | logout 只登出当前设备；远程登出（revoke）删指定会话 |
| 过期 | 会话 7 天后过期（与 JWT_REFRESH_EXPIRES_IN 一致） |
| 所有权 | revoke 只能删本人会话，否则 401 |
| 密码重置 | resetPassword 撤销该用户全部会话 |

## 5. 前端

- `SessionProvider`：`load()` 拉会话列表、`revoke(id)` 远程登出（移除列表项）
- `SessionListPage`（`/sessions`）：设备列表（名称 + 最后活跃 + 当前设备标记）+ 非当前设备尾部登出按钮 + 确认对话框 + toast
- 入口：设置页「账户」分组「登录设备管理」
- 登录请求带 `deviceName`（按平台生成：Windows/iPhone/Mac/Android/Web）
- ApiClient 已对所有请求带 `X-Device-Id` 头（`getOrCreateDeviceId()` 持久化）

## 6. 测试

- 后端单测：auth.service.spec 新增 6 用例（refresh 按会话校验/失配撤销、getSessions isCurrent、revoke 本人/他人、logout 按设备删）
- 后端 e2e：3 用例（登录登记会话 + 列表 isCurrent、远程登出本人、删他人会话拒绝）
- 前端单测：session_provider_test 4 用例（load 成功/失败、revoke 成功/失败）
