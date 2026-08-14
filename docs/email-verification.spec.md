# 邮箱验证（AU-2）功能规格 / Email Verification (AU-2) Feature Spec

## 1. 概述 / Overview

注册后发送 6 位邮箱验证码，用户提交验证码完成验证。复用 PL-1 邮件服务（`MailService.sendVerificationEmail`）。未验证账号在前端 Profile 显示提示，功能限制（如限制写操作）留作后续。

After registration, a 6-digit email verification code is sent; the user submits the code to complete verification. Reuses the PL-1 mail service (`MailService.sendVerificationEmail`). Unverified accounts show a prompt on the frontend Profile; feature restrictions (e.g., limiting write operations) are left for later.

## 2. 数据模型 / Data Model

User 实体新增字段：

New fields added to the User entity:

| 字段 / Field | 类型 / Type | 说明 / Description |
|------|------|------|
| emailVerified | boolean (default false) | 是否已验证邮箱 / Whether the email is verified |
| emailVerificationCode | varchar(64) | 验证码的 SHA-256 hash / SHA-256 hash of the verification code |
| emailVerificationExpiresAt | datetime | 验证码过期时间（10 分钟） / Verification code expiry (10 minutes) |

明文 6 位验证码（`crypto.randomInt(100000, 1000000)`）仅通过邮件发给用户，DB 只存 hash。

The plaintext 6-digit code (`crypto.randomInt(100000, 1000000)`) is only sent to the user by email; the DB stores only the hash.

## 3. API 规格 / API Spec

| Method | Path | Auth | 限流 / Rate Limit | 说明 / Description |
|--------|------|------|------|------|
| POST | /api/v1/auth/verify-email | 公开 / Public | 5/min | 提交 {email, code} 验证邮箱 / Submit {email, code} to verify the email |
| POST | /api/v1/auth/resend-verification | 公开 / Public | 5/min | 重新发送验证码（统一响应防枚举） / Resend the verification code (unified response to prevent enumeration) |

### 请求/响应 / Request/Response

```
POST /auth/verify-email
{ "email": "user@example.com", "code": "123456" }
→ 200 { "data": { "message": "Email verified successfully" } }
→ 401 { "message": "Invalid or expired verification code" }

POST /auth/resend-verification
{ "email": "user@example.com" }
→ 200 { "data": { "message": "If that email is registered, a verification code has been sent." } }
```

## 4. 业务规则 / Business Rules

| 规则 / Rule | 说明 / Description |
|------|------|
| 注册发码 / Send code on registration | `register()` 成功后生成验证码并发送（邮件失败不阻断注册） / Generate and send the code after `register()` succeeds (mail failure does not block registration) |
| 防枚举 / Anti-enumeration | `resend-verification` 无论邮箱是否存在，都等待随机延迟并返回统一响应 / `resend-verification` waits a random delay and returns a unified response whether or not the email exists |
| 验证码 / Verification code | 6 位数字，10 分钟有效，SHA-256 hash 存储 / 6-digit, valid for 10 minutes, stored as a SHA-256 hash |
| 验证成功 / Verification success | 置 emailVerified=true，清除验证码 / Set emailVerified=true and clear the code |
| 已验证账号 / Already-verified accounts | verify-email 返回 401（重复验证无效） / verify-email returns 401 (re-verification is invalid) |
| 响应字段 / Response fields | register/login/refresh 返回的 user 带 emailVerified / The user returned by register/login/refresh includes emailVerified |

## 5. 前端 / Frontend

- 注册成功 → 跳 `/verify-email?email=...`（预填邮箱 + 验证码输入 + 重新发送链接）
  After successful registration → navigate to `/verify-email?email=...` (pre-filled email + verification code input + resend link)
- Profile：未验证时显示「邮箱未验证 → 去验证」提示行
  Profile: shows an "Email not verified → Verify" prompt row when unverified
- `AuthProvider.verifyEmail/resendVerification`；验证成功后本地 user 刷新 emailVerified
  `AuthProvider.verifyEmail/resendVerification`; refresh the local user's emailVerified after successful verification
- 路由 `/verify-email` 并入 redirect 守卫 isAuthRoute
  The `/verify-email` route is included in the redirect guard isAuthRoute

## 6. 测试 / Testing

- 后端单测：auth.service.spec 新增 6 用例（verifyEmail 有效/错误码/过期/已验证、resend 已注册/未知邮箱）
  Backend unit tests: add 6 cases to auth.service.spec (verifyEmail valid/wrong code/expired/already verified, resend registered/unknown email)
- 后端 e2e：2 用例（verify-email 错误码 401、resend 统一响应）
  Backend e2e: 2 cases (verify-email wrong code 401, resend unified response)
- 前端单测：auth_provider_test 新增 4 用例（verifyEmail/resendVerification 成功与失败）
  Frontend unit tests: add 4 cases to auth_provider_test (verifyEmail/resendVerification success and failure)

## 6.5 未验证功能限制（EmailVerificationGuard）/ Unverified Feature Restriction (EmailVerificationGuard)

全局 `EmailVerificationGuard`（JwtAuthGuard 之后）：已登录用户执行写操作（POST/PATCH/PUT/DELETE）前要求邮箱已验证。

The global `EmailVerificationGuard` (after JwtAuthGuard): requires an email to be verified before an authenticated user performs a write operation (POST/PATCH/PUT/DELETE).

| 放行 / Allowed | 拦截 / Blocked |
|------|------|
| GET / @Public / @SkipEmailVerification / 未登录 / admin / not logged in | 未验证邮箱用户的写操作 → 403「请先验证邮箱」 / Write operations by users with unverified email → 403 "Please verify your email first" |

- JWT payload 无 emailVerified，守卫查 DB（`UsersService.findOne`）最准
  The JWT payload has no emailVerified; the guard queries the DB (`UsersService.findOne`) for the most accurate result
- admin 视为已验证（避免锁死管理操作）
  admin is treated as verified (to avoid locking down admin operations)
- `@SkipEmailVerification()` 装饰器（仿 skip-audit）可显式排除端点
  The `@SkipEmailVerification()` decorator (modeled after skip-audit) can explicitly exclude endpoints
- 测试：guard.spec 7 用例 + e2e（未验证 403 / 验证后放行）；e2e `registerUser` helper 默认置已验证避免误拦常规用例
  Testing: guard.spec 7 cases + e2e (unverified 403 / allowed after verification); the e2e `registerUser` helper defaults to verified to avoid wrongly blocking routine cases

## 7. 后续 / Future Work

- 未验证功能限制（roadmap 提及）：可对写操作加 `emailVerified` 守卫，需波及所有 controller，留作独立任务
  Unverified feature restriction (mentioned in the roadmap): could add an `emailVerified` guard to write operations, but it would touch all controllers, so it is left as a standalone task
