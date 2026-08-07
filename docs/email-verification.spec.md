# 邮箱验证（AU-2）功能规格

## 1. 概述

注册后发送 6 位邮箱验证码，用户提交验证码完成验证。复用 PL-1 邮件服务（`MailService.sendVerificationEmail`）。未验证账号在前端 Profile 显示提示，功能限制（如限制写操作）留作后续。

## 2. 数据模型

User 实体新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| emailVerified | boolean (default false) | 是否已验证邮箱 |
| emailVerificationCode | varchar(64) | 验证码的 SHA-256 hash |
| emailVerificationExpiresAt | datetime | 验证码过期时间（10 分钟） |

明文 6 位验证码（`crypto.randomInt(100000, 1000000)`）仅通过邮件发给用户，DB 只存 hash。

## 3. API 规格

| Method | Path | Auth | 限流 | 说明 |
|--------|------|------|------|------|
| POST | /api/v1/auth/verify-email | 公开 | 5/min | 提交 {email, code} 验证邮箱 |
| POST | /api/v1/auth/resend-verification | 公开 | 5/min | 重新发送验证码（统一响应防枚举） |

### 请求/响应

```
POST /auth/verify-email
{ "email": "user@example.com", "code": "123456" }
→ 200 { "data": { "message": "Email verified successfully" } }
→ 401 { "message": "Invalid or expired verification code" }

POST /auth/resend-verification
{ "email": "user@example.com" }
→ 200 { "data": { "message": "If that email is registered, a verification code has been sent." } }
```

## 4. 业务规则

| 规则 | 说明 |
|------|------|
| 注册发码 | `register()` 成功后生成验证码并发送（邮件失败不阻断注册） |
| 防枚举 | `resend-verification` 无论邮箱是否存在，都等待随机延迟并返回统一响应 |
| 验证码 | 6 位数字，10 分钟有效，SHA-256 hash 存储 |
| 验证成功 | 置 emailVerified=true，清除验证码 |
| 已验证账号 | verify-email 返回 401（重复验证无效） |
| 响应字段 | register/login/refresh 返回的 user 带 emailVerified |

## 5. 前端

- 注册成功 → 跳 `/verify-email?email=...`（预填邮箱 + 验证码输入 + 重新发送链接）
- Profile：未验证时显示「邮箱未验证 → 去验证」提示行
- `AuthProvider.verifyEmail/resendVerification`；验证成功后本地 user 刷新 emailVerified
- 路由 `/verify-email` 并入 redirect 守卫 isAuthRoute

## 6. 测试

- 后端单测：auth.service.spec 新增 6 用例（verifyEmail 有效/错误码/过期/已验证、resend 已注册/未知邮箱）
- 后端 e2e：2 用例（verify-email 错误码 401、resend 统一响应）
- 前端单测：auth_provider_test 新增 4 用例（verifyEmail/resendVerification 成功与失败）

## 6.5 未验证功能限制（EmailVerificationGuard）

全局 `EmailVerificationGuard`（JwtAuthGuard 之后）：已登录用户执行写操作（POST/PATCH/PUT/DELETE）前要求邮箱已验证。

| 放行 | 拦截 |
|------|------|
| GET / @Public / @SkipEmailVerification / 未登录 / admin | 未验证邮箱用户的写操作 → 403「请先验证邮箱」 |

- JWT payload 无 emailVerified，守卫查 DB（`UsersService.findOne`）最准
- admin 视为已验证（避免锁死管理操作）
- `@SkipEmailVerification()` 装饰器（仿 skip-audit）可显式排除端点
- 测试：guard.spec 7 用例 + e2e（未验证 403 / 验证后放行）；e2e `registerUser` helper 默认置已验证避免误拦常规用例

## 7. 后续

- 未验证功能限制（roadmap 提及）：可对写操作加 `emailVerified` 守卫，需波及所有 controller，留作独立任务
