# 忘记密码 / 密码重置（AU-1）功能规格

## 1. 概述

用户忘记密码时，通过注册邮箱找回：提交邮箱 → 后端发送含重置链接的邮件 → 打开链接设置新密码。复用 PL-1 邮件服务（`MailService.sendPasswordResetEmail`）。

## 2. 流程

```
用户 → 登录页「忘记密码？」 → /forgot-password（输邮箱）
     → POST /auth/forgot-password → 发邮件（30 分钟有效链接）
     → 点击邮件链接 → /reset?token=xxx（输新密码）
     → POST /auth/reset-password → 密码重置，强制重新登录
```

## 3. API 规格

| Method | Path | Auth | 限流 | 说明 |
|--------|------|------|------|------|
| POST | /api/v1/auth/forgot-password | 公开 | 5/min | 请求发送重置邮件，**统一响应（防枚举）** |
| POST | /api/v1/auth/reset-password | 公开 | 5/min | 用邮件链接 token 重置密码 |

### 请求/响应

```
POST /auth/forgot-password
{ "email": "user@example.com" }
→ 200 { "data": { "message": "If that email is registered, a reset link has been sent." } }

POST /auth/reset-password
{ "token": "c4a8...", "newPassword": "NewPass123" }
→ 200 { "data": { "message": "Password has been reset. Please login again." } }
→ 401 { "message": "Invalid or expired reset token" }
```

## 4. 安全规则

| 规则 | 说明 |
|------|------|
| 防枚举 | `forgot-password` 无论邮箱是否存在，都等待随机延迟（200-500ms）并返回统一成功响应 |
| Token 存储 | 明文 token（32 字节 hex）仅通过邮件发送；DB 存 SHA-256 hash（与 refreshTokenHash 同模式） |
| Token 有效期 | 30 分钟；过期后拒绝重置 |
| 会话失效 | 重置成功后清除 `refreshTokenHash`，现有会话全部失效，强制重新登录 |
| 密码强度 | 新密码 ≥8 位且含字母和数字，bcrypt 12 轮 |
| 邮件失败 | SMTP 未配置/发送失败不阻断——仍返回统一响应（防枚举），错误记日志 |

## 5. 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `APP_BASE_URL` | `http://localhost:8080` | 前端地址，用于拼重置链接 `${APP_BASE_URL}/reset?token=...` |

## 6. 前端页面

| 页面 | 路由 | 说明 |
|------|------|------|
| ForgotPasswordPage | `/forgot-password` | 输入邮箱 → 提交 → 显示"已发送"提示 + 返回登录 |
| ResetPasswordPage | `/reset?token=xxx` | 新密码 + 确认 → 提交 → 成功跳登录 |

路由均已并入 redirect 守卫的 `isAuthRoute`（未登录可访问）。登录页底部加入口。

## 7. 测试

- 后端单测：auth.service.spec 新增 7 用例（forgot 存在/不存在统一响应 + 邮件失败不抛错 + reset 有效/无效/过期）
- 后端 e2e：3 用例（unknown/known email 统一响应 + 无效 token 401）
- 前端单测：auth_provider_test 新增 4 用例（requestPasswordReset / resetPassword 成功与失败）
