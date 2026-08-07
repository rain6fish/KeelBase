# 账号与合规 — 功能规格说明

> 来源：`account-compliance-requirements.md`（需求确认书）
> 范围：SMS 手机号验证 / 自助注销 / 数据导出

---

## 1. 数据规格

### 1.1 User 实体新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `phoneVerified` | boolean, default false | 手机号是否已验证 |
| `phoneHash` | varchar(64) nullable | HMAC-SHA256(phone) 派生，供手机号精确查询（phone 为 GCM 密文不可 where） |

> `phone` 列已存在（AES-256-GCM 加密），沿用。

### 1.2 新实体 `PhoneVerificationCode`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | int PK | |
| `phone` | varchar(20) | 手机号（明文，验证码表的瞬态数据） |
| `codeHash` | varchar(64) | SHA-256(验证码)，不落明文 |
| `expiresAt` | datetime | 10 分钟有效 |
| `used` | boolean default false | 使用后置位 |
| `createdAt` | datetime | |

索引：`phone`。

### 1.3 迁移

`AddAccountComplianceColumns`：User 加 `phone_verified`/`phone_hash`；建 `phone_verification_codes` 表。sqlite + postgres 双语（仿 AddOperationAuditFeatureColumns）。

## 2. API 规格

### 2.1 SMS 手机验证

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | `/api/v1/auth/send-sms-code` | No | 发送验证码（限流 5/m/phone，防枚举统一响应） |
| POST | `/api/v1/auth/bind-phone` | Yes | 绑定/更新手机号（校验验证码） |
| POST | `/api/v1/auth/login-phone` | No | 手机号 + 验证码登录（限流 10/m） |

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

### 2.2 自助注销

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | `/api/v1/auth/deactivate` | Yes | 注销本人账号（密码确认） |

```json
// 请求（Bearer）
{ "password": "MyPass123" }
// 成功
{ "code": 200, "message": "账号已注销", "data": null }
// 密码错误 401（防枚举：密码错误与用户不存在同提示）
```

清理逻辑：删用户行 → 依赖 FK 级联（events.userId CASCADE）+ 手动清理（user_sessions / notifications / ai_conversations / ai_messages / todos / push_tokens / ai_audit_logs / operation_audit_logs.userId 置 null / phone_verification_codes）。登出全部会话（清 refreshTokenHash + sessions）。

保护：不能注销最后一个 admin（复用 users.service 的校验思路）；注销后 JWT 立即失效（清会话）。

### 2.3 数据导出

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/api/v1/auth/export-data` | Yes | 导出本人数据 JSON |

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

## 3. 业务规则

- **验证码**：6 位数字，SHA-256 存 hash，10 分钟有效，使用后置 used=true；同手机号 5 分钟内仅 1 条有效未用记录
- **防枚举**：send-sms-code 无论手机号是否注册均返回统一成功；login-phone 手机号未注册返回「手机号未注册」
- **SMS 驱动**：`SMS_DRIVER=console` 时验证码打印日志（本地/测试）；`aliyun` 预留（凭据 `ALIYUN_SMS_*` 到位后接 SmsService 子类），降级语义同 MailService（配置缺失不抛错）
- **phoneHash**：绑定/登录时用 `EncryptionService.hmac(phone)` 派生查询
- **注销**：真删 + 级联清理；不能删最后一个 admin；成功后清全部会话
- **导出**：仅本人数据，`/auth/export-data` 不脱敏（本人全量），但剔除密钥/登录凭据字段

## 4. 环境变量

```bash
SMS_DRIVER=console            # console | aliyun（预留）
# aliyun 预留（凭据到位后启用）
ALIYUN_SMS_ACCESS_KEY_ID=
ALIYUN_SMS_ACCESS_KEY_SECRET=
ALIYUN_SMS_SIGN_NAME=
ALIYUN_SMS_TEMPLATE_CODE=
```

## 5. 测试用例

### 后端单测
- SmsService：console 驱动发码 / 凭据缺失降级不抛错 / codeHash 不落明文
- AuthService.sendSmsCode：验证码入库（hash）/ 同手机号限频 / 防枚举统一响应
- AuthService.bindPhone：成功绑定 / 验证码错误 / 手机号占用 409 / 更新已有手机号
- AuthService.loginPhone：成功签发 token / 验证码错误 / 手机号未注册
- AuthService.deactivate：密码正确删除+清理 / 密码错误 401 / 最后一个 admin 拒绝
- AuthService.exportData：聚合返回全量字段 / 不含密钥

### e2e
- 发送验证码 → 绑定手机 → 手机号登录闭环
- 验证码错误 400、限频 429
- 注销后原 token 访问 401、通知/会话被清
- 导出数据包含事件/待办

## 6. 文档同步

- CLAUDE.md §9 API 端点汇总表追加 5 个端点
- `.env.example` 加 SMS_DRIVER
