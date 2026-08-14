# 忘记密码 / 密码重置（AU-1）功能规格 / Forgot Password / Password Reset (AU-1) Feature Specification

## 1. 概述 / 1. Overview

用户忘记密码时，通过注册邮箱找回：提交邮箱 → 后端发送含重置链接的邮件 → 打开链接设置新密码。复用 PL-1 邮件服务（`MailService.sendPasswordResetEmail`）。

When a user forgets their password, recovery goes through the registered email: submit the email → the backend sends an email containing a reset link → open the link and set a new password. Reuses the PL-1 mail service (`MailService.sendPasswordResetEmail`).

## 2. 流程 / 2. Flow

```
用户 → 登录页「忘记密码？」 → /forgot-password（输邮箱）
     → POST /auth/forgot-password → 发邮件（30 分钟有效链接）
     → 点击邮件链接 → /reset?token=xxx（输新密码）
     → POST /auth/reset-password → 密码重置，强制重新登录
```

## 3. API 规格 / 3. API Specification

| Method | Path | Auth | 限流 / Rate limit | 说明 / Description |
|--------|------|------|------|------|
| POST | /api/v1/auth/forgot-password | 公开 / Public | 5/min | 请求发送重置邮件，**统一响应（防枚举）** / Request to send a reset email; **unified response (enumeration protection)** |
| POST | /api/v1/auth/reset-password | 公开 / Public | 5/min | 用邮件链接 token 重置密码 / Reset the password using the token from the email link |

### 请求/响应 / Request / Response

```
POST /auth/forgot-password
{ "email": "user@example.com" }
→ 200 { "data": { "message": "If that email is registered, a reset link has been sent." } }

POST /auth/reset-password
{ "token": "c4a8...", "newPassword": "NewPass123" }
→ 200 { "data": { "message": "Password has been reset. Please login again." } }
→ 401 { "message": "Invalid or expired reset token" }
```

## 4. 安全规则 / 4. Security Rules

| 规则 / Rule | 说明 / Description |
|------|------|
| 防枚举 / Enumeration protection | `forgot-password` 无论邮箱是否存在，都等待随机延迟（200-500ms）并返回统一成功响应 / `forgot-password` waits a random delay (200-500ms) and returns a unified success response whether or not the email exists |
| Token 存储 / Token storage | 明文 token（32 字节 hex）仅通过邮件发送；DB 存 SHA-256 hash（与 refreshTokenHash 同模式） / The plaintext token (32-byte hex) is sent only via email; the DB stores the SHA-256 hash (same pattern as refreshTokenHash) |
| Token 有效期 / Token validity | 30 分钟；过期后拒绝重置 / 30 minutes; resets are rejected after expiry |
| 会话失效 / Session invalidation | 重置成功后清除 `refreshTokenHash`，现有会话全部失效，强制重新登录 / Clears `refreshTokenHash` after a successful reset; all existing sessions are invalidated, forcing re-login |
| 密码强度 / Password strength | 新密码 ≥8 位且含字母和数字，bcrypt 12 轮 / New password ≥8 chars containing letters and digits, bcrypt 12 rounds |
| 邮件失败 / Mail failure | SMTP 未配置/发送失败不阻断——仍返回统一响应（防枚举），错误记日志 / SMTP not configured / send failure does not block — still returns the unified response (enumeration protection); errors are logged |

## 5. 环境变量 / 5. Environment Variables

| 变量 / Variable | 默认值 / Default | 说明 / Description |
|------|--------|------|
| `APP_BASE_URL` | `http://localhost:8080` | 前端地址，用于拼重置链接 `${APP_BASE_URL}/reset?token=...` / Frontend base URL, used to build the reset link `${APP_BASE_URL}/reset?token=...` |

## 6. 前端页面 / 6. Frontend Pages

| 页面 / Page | 路由 / Route | 说明 / Description |
|------|------|------|
| ForgotPasswordPage | `/forgot-password` | 输入邮箱 → 提交 → 显示"已发送"提示 + 返回登录 / Enter email → submit → show "sent" notice + return to login |
| ResetPasswordPage | `/reset?token=xxx` | 新密码 + 确认 → 提交 → 成功跳登录 / New password + confirmation → submit → on success, go to login |

路由均已并入 redirect 守卫的 `isAuthRoute`（未登录可访问）。登录页底部加入口。

Both routes are merged into the redirect guard's `isAuthRoute` (accessible while logged out). An entry is added at the bottom of the login page.

## 7. 测试 / 7. Tests

- 后端单测：auth.service.spec 新增 7 用例（forgot 存在/不存在统一响应 + 邮件失败不抛错 + reset 有效/无效/过期）
  Backend unit tests: auth.service.spec adds 7 cases (forgot unified response for existing / non-existing + mail failure does not throw + reset valid / invalid / expired)
- 后端 e2e：3 用例（unknown/known email 统一响应 + 无效 token 401）
  Backend e2e: 3 cases (unified response for unknown/known email + invalid token 401)
- 前端单测：auth_provider_test 新增 4 用例（requestPasswordReset / resetPassword 成功与失败）
  Frontend unit tests: auth_provider_test adds 4 cases (requestPasswordReset / resetPassword success and failure)
