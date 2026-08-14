# 账号与合规 — 功能规格说明 / Account & Compliance — Functional Specification

> 来源：`account-compliance-requirements.md`（需求确认书）
> Source: `account-compliance-requirements.md` (requirements confirmation)
> 范围：SMS 手机号验证 / 自助注销 / 数据导出
> Scope: SMS phone verification / self-service account deactivation / data export

---

## 1. 数据规格 / 1. Data Specification

### 1.1 User 实体新增字段 / 1.1 New Fields on the User Entity

| 字段 / Field | 类型 / Type | 说明 / Description |
|------|------|------|
| `phoneVerified` | boolean, default false | 手机号是否已验证 / Whether the phone number has been verified |
| `phoneHash` | varchar(64) nullable | HMAC-SHA256(phone) 派生，供手机号精确查询（phone 为 GCM 密文不可 where） / Derived via HMAC-SHA256(phone) for exact phone lookup (phone is GCM ciphertext and cannot be used in a WHERE clause) |

> `phone` 列已存在（AES-256-GCM 加密），沿用。
> The `phone` column already exists (AES-256-GCM encrypted) and is reused.

### 1.2 新实体 `PhoneVerificationCode` / 1.2 New Entity `PhoneVerificationCode`

| 字段 / Field | 类型 / Type | 说明 / Description |
|------|------|------|
| `id` | int PK | |
| `phone` | varchar(20) | 手机号（明文，验证码表的瞬态数据） / Phone number (plaintext, transient data in the verification-code table) |
| `codeHash` | varchar(64) | SHA-256(验证码)，不落明文 / SHA-256(verification code), never stored in plaintext |
| `expiresAt` | datetime | 10 分钟有效 / Valid for 10 minutes |
| `used` | boolean default false | 使用后置位 / Set to true after use |
| `createdAt` | datetime | |

索引：`phone`。

Index: `phone`.

### 1.3 迁移 / 1.3 Migration

`AddAccountComplianceColumns`：User 加 `phone_verified`/`phone_hash`；建 `phone_verification_codes` 表。sqlite + postgres 双语（仿 AddOperationAuditFeatureColumns）。

`AddAccountComplianceColumns`: adds `phone_verified`/`phone_hash` to User; creates the `phone_verification_codes` table. Generated for both the sqlite and postgres dialects (modeled after `AddOperationAuditFeatureColumns`).

## 2. API 规格 / 2. API Specification

### 2.1 SMS 手机验证 / 2.1 SMS Phone Verification

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | `/api/v1/auth/send-sms-code` | No | 发送验证码（限流 5/m/phone，防枚举统一响应） / Send verification code (rate limit 5/m/phone, unified anti-enumeration response) |
| POST | `/api/v1/auth/bind-phone` | Yes | 绑定/更新手机号（校验验证码） / Bind/update phone number (verifies the code) |
| POST | `/api/v1/auth/login-phone` | No | 手机号 + 验证码登录（限流 10/m） / Login with phone number + code (rate limit 10/m) |

**send-sms-code**
```json
// 请求
{ "phone": "+8613800138000" }
// 响应（统一，不暴露是否已注册）
{ "code": 200, "message": "验证码已发送", "data": { "sent": true } }
// console 驱动下验证码打印到日志：[SMS] code 123456 for +86...
```

**bind-phone**
```json
// 请求（Bearer）
{ "phone": "+8613800138000", "code": "123456" }
// 成功
{ "data": { "phone": "+8613800138000", "phoneVerified": true } }
// 失败：验证码错误 400 / 手机号被占用 409
```

**login-phone**
```json
// 请求
{ "phone": "+8613800138000", "code": "123456", "deviceId"?: "..." }
// 成功：同 login 返回 accessToken/refreshToken/user
// 手机号未注册 404（统一提示「手机号未注册」）；验证码错误 400
```

### 2.2 自助注销 / 2.2 Self-Service Deactivation

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | `/api/v1/auth/deactivate` | Yes | 注销本人账号（密码确认） / Deactivate own account (password confirmation) |

```json
// 请求（Bearer）
{ "password": "MyPass123" }
// 成功
{ "code": 200, "message": "账号已注销", "data": null }
// 密码错误 401（防枚举：密码错误与用户不存在同提示）
```

清理逻辑：删用户行 → 依赖 FK 级联（events.userId CASCADE）+ 手动清理（user_sessions / notifications / ai_conversations / ai_messages / todos / push_tokens / ai_audit_logs / operation_audit_logs.userId 置 null / phone_verification_codes）。登出全部会话（清 refreshTokenHash + sessions）。

Cleanup logic: delete the user row → rely on FK cascade (events.userId CASCADE) + manual cleanup (user_sessions / notifications / ai_conversations / ai_messages / todos / push_tokens / ai_audit_logs / operation_audit_logs.userId set to null / phone_verification_codes). Log out all sessions (clear refreshTokenHash + sessions).

保护：不能注销最后一个 admin（复用 users.service 的校验思路）；注销后 JWT 立即失效（清会话）。

Protection: the last admin cannot be deactivated (reusing the validation approach in users.service); JWTs become invalid immediately after deactivation (sessions are cleared).

### 2.3 数据导出 / 2.3 Data Export

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| GET | `/api/v1/auth/export-data` | Yes | 导出本人数据 JSON / Export the user's own data as JSON |

```json
// 响应 data
{
  "profile": { "username": "...", "email": "...", "phone": "...", "nickname": "...", "createdAt": "..." },
  "events": [...], "todos": [...],
  "conversations": [{ "id": "...", "role": "...", "content": "...", "createdAt": "..." }],
  "notifications": [...],
  "aiUsage": { "totalTokens": 123, "totalMessages": 5 }
}
```

## 3. 业务规则 / 3. Business Rules

- **验证码**：6 位数字，SHA-256 存 hash，10 分钟有效，使用后置 used=true；同手机号 5 分钟内仅 1 条有效未用记录
  **Verification code**: 6 digits, stored as a SHA-256 hash, valid for 10 minutes, marked used=true after use; at most 1 valid unused record per phone number within 5 minutes
- **防枚举**：send-sms-code 无论手机号是否注册均返回统一成功；login-phone 手机号未注册返回「手机号未注册」
  **Anti-enumeration**: send-sms-code always returns a uniform success regardless of whether the phone is registered; login-phone returns "phone not registered" for unregistered numbers
- **SMS 驱动**：`SMS_DRIVER=console` 时验证码打印日志（本地/测试）；`aliyun` 预留（凭据 `ALIYUN_SMS_*` 到位后接 SmsService 子类），降级语义同 MailService（配置缺失不抛错）
  **SMS driver**: with `SMS_DRIVER=console`, the code is printed to the log (local/testing); `aliyun` is reserved (wire an SmsService subclass once the `ALIYUN_SMS_*` credentials are available), with the same degradation semantics as MailService (no error thrown when configuration is missing)
- **phoneHash**：绑定/登录时用 `EncryptionService.hmac(phone)` 派生查询
  **phoneHash**: derived for lookup via `EncryptionService.hmac(phone)` on bind/login
- **注销**：真删 + 级联清理；不能删最后一个 admin；成功后清全部会话
  **Deactivation**: hard delete + cascade cleanup; the last admin cannot be deleted; all sessions are cleared on success
- **导出**：仅本人数据，`/auth/export-data` 不脱敏（本人全量），但剔除密钥/登录凭据字段
  **Export**: own data only; `/auth/export-data` is not masked (full data for the user), but excludes secret/login-credential fields

## 4. 环境变量 / 4. Environment Variables

```bash
SMS_DRIVER=console            # console | aliyun（预留）
# aliyun 预留（凭据到位后启用）
ALIYUN_SMS_ACCESS_KEY_ID=
ALIYUN_SMS_ACCESS_KEY_SECRET=
ALIYUN_SMS_SIGN_NAME=
ALIYUN_SMS_TEMPLATE_CODE=
```

## 5. 测试用例 / 5. Test Cases

### 后端单测 / Backend Unit Tests
- SmsService：console 驱动发码 / 凭据缺失降级不抛错 / codeHash 不落明文
  SmsService: console driver sends the code / missing credentials degrade without throwing / codeHash never stored in plaintext
- AuthService.sendSmsCode：验证码入库（hash）/ 同手机号限频 / 防枚举统一响应
  AuthService.sendSmsCode: code persisted (hash) / rate-limited per phone number / unified anti-enumeration response
- AuthService.bindPhone：成功绑定 / 验证码错误 / 手机号占用 409 / 更新已有手机号
  AuthService.bindPhone: successful bind / wrong code / phone already taken 409 / updating an existing phone
- AuthService.loginPhone：成功签发 token / 验证码错误 / 手机号未注册
  AuthService.loginPhone: token issued on success / wrong code / phone not registered
- AuthService.deactivate：密码正确删除+清理 / 密码错误 401 / 最后一个 admin 拒绝
  AuthService.deactivate: correct password deletes + cleans up / wrong password 401 / last admin rejected
- AuthService.exportData：聚合返回全量字段 / 不含密钥
  AuthService.exportData: aggregates and returns all fields / excludes secrets

### e2e
- 发送验证码 → 绑定手机 → 手机号登录闭环
  Send code → bind phone → phone-login end-to-end loop
- 验证码错误 400、限频 429
  Wrong code 400, rate-limited 429
- 注销后原 token 访问 401、通知/会话被清
  After deactivation, the old token returns 401 and notifications/sessions are cleared
- 导出数据包含事件/待办
  Exported data includes events/todos

## 6. 文档同步 / 6. Documentation Sync

- CLAUDE.md §9 API 端点汇总表追加 5 个端点
  Append 5 endpoints to the API endpoint summary table in CLAUDE.md §9
- `.env.example` 加 SMS_DRIVER
  Add SMS_DRIVER to `.env.example`
