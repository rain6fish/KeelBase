# 账号与合规 — 需求确认书 / Account & Compliance — Requirements Confirmation

> 日期：2026-08-06
> Date: 2026-08-06
> 范围：SMS 手机号验证 / 用户自助注销 / 用户自助导出数据（① 账号与合规类）
> Scope: SMS phone verification / user self-service deactivation / user self-service data export (① account & compliance category)

---

## 1. 背景 / 1. Background

基座已具备邮箱验证（AU-2）、忘记密码（AU-1）、多设备会话（AU-3）等账号能力，但手机号仅加密存储、无验证流程；用户侧无法自助注销或导出个人数据。本需求补齐国内 App 上架必备的合规能力。

The base platform already has account capabilities such as email verification (AU-2), forgot-password (AU-1), and multi-device sessions (AU-3), but phone numbers are only encrypted and stored with no verification flow, and users cannot self-service deactivate or export their personal data. This requirement fills in the compliance capabilities required for domestic (China) app-store release.

## 2. 功能需求 / 2. Functional Requirements

### 2.1 SMS 手机号验证码 / 2.1 SMS Phone Verification Code

| # | 需求 / Requirement | 说明 / Description |
|---|------|------|
| S1 | 发送短信验证码 / Send SMS verification code | 用户输入手机号 → 下发 6 位验证码（10 分钟有效，5 分钟内同手机号限 1 次） / User enters a phone number → a 6-digit code is sent (valid for 10 minutes, limited to 1 per phone number within 5 minutes) |
| S2 | 绑定/更新手机号 / Bind/update phone number | 登录用户验证码校验通过后绑定手机号；重复绑定校验占用（防他人绑定） / After a logged-in user's code is verified, bind the phone number; re-binding checks for occupancy (prevents others from binding it) |
| S3 | 手机号验证码登录 / Phone + code login | 手机号 + 验证码直接登录（无密码账号可用）；未注册手机号是否自动注册由配置决定（默认不自动注册，避免撞库） / Log in directly with phone number + code (works for passwordless accounts); whether unregistered phone numbers auto-register is decided by configuration (default: no auto-registration, to avoid account enumeration) |
| S4 | 防枚举 / Anti-enumeration | 发送验证码统一响应（不暴露手机号是否已注册）；限流（5 次/分钟/手机号，全局 20 次/分钟） / Unified response when sending codes (does not reveal whether the phone is registered); rate limiting (5/min/phone, global 20/min) |
| S5 | 服务商抽象 / Provider abstraction | `SMS_DRIVER=console`（默认，验证码打印到日志，便于本地开发/测试）；`aliyun` 预留（需凭据） / `SMS_DRIVER=console` (default, code printed to the log for local dev/testing); `aliyun` reserved (requires credentials) |

### 2.2 用户自助注销账号 / 2.2 User Self-Service Account Deactivation

| # | 需求 / Requirement | 说明 / Description |
|---|------|------|
| D1 | 注销入口 / Deactivation entry | 登录用户可申请注销（`POST /auth/deactivate`） / A logged-in user can request deactivation (`POST /auth/deactivate`) |
| D2 | 安全确认 / Security confirmation | 需提交当前密码（本地账号）校验，防误删/盗号注销 / Requires submitting the current password (for local accounts) for verification, preventing accidental deletion or hijacked deactivation |
| D3 | 级联清理 / Cascade cleanup | 删除用户后清理：登录会话、通知、AI 对话/消息、待办、事件、设备推送 token、操作审计关联 / After deleting the user, clean up: login sessions, notifications, AI conversations/messages, todos, events, device push tokens, and operation-audit links |
| D4 | 保护 / Protection | 不能注销最后一个管理员（复用现有守卫逻辑）；注销后所有已签发 token 失效（清会话 + refreshTokenHash） / The last admin cannot be deactivated (reusing existing guard logic); after deactivation, all issued tokens become invalid (clear sessions + refreshTokenHash) |
| D5 | 幂等 / Idempotency | 用户已不存在时返回成功（统一响应，不泄露状态） / Returns success when the user no longer exists (unified response, does not leak state) |

### 2.3 用户自助导出数据 / 2.3 User Self-Service Data Export

| # | 需求 / Requirement | 说明 / Description |
|---|------|------|
| E1 | 导出本人数据 / Export own data | 登录用户导出本人全量数据（`GET /auth/export-data`），返回 JSON / A logged-in user exports their full data (`GET /auth/export-data`), returned as JSON |
| E2 | 内容 / Content | profile（脱敏不含密钥）+ 事件 + 待办 + AI 对话 + 通知 + AI 用量统计 / profile (masked, no secrets) + events + todos + AI conversations + notifications + AI usage statistics |
| E3 | 权限 / Permission | 仅本人可见（JWT 校验），不经过管理端接口 / Visible only to the user (JWT-verified), not routed through admin endpoints |

## 3. 非目标（本批不做） / 3. Non-Goals (Not in This Batch)

- 短信服务商真实对接（SMS 凭据到位的后续项，抽象已就绪）
  Real SMS-provider integration (a follow-up item once SMS credentials are in place; the abstraction is already ready)
- 注销冷静期/二次确认流程（当前一次确认 + 密码校验）
  Deactivation cooling-off / second-confirmation flow (currently one-time confirmation + password verification)
- 导出格式自定义（固定 JSON）
  Customizable export format (fixed JSON)

## 4. 约束与红线 / 4. Constraints & Red Lines

- 遵循 CLAUDE.md §5.5：手机号在服务端加密存储 + 派生 hash 查询；接口统一响应
  Follow CLAUDE.md §5.5: phone numbers are encrypted at rest on the server + looked up via a derived hash; unified API responses
- 防枚举语义与现有 forgot-password / verify-email 一致
  Anti-enumeration semantics consistent with the existing forgot-password / verify-email
- 新实体需生成迁移（sqlite + postgres 双语迁移，CI 一致性校验）
  New entities require generated migrations (dual-dialect for sqlite + postgres, with a CI consistency check)

## 5. 演示账号 / 5. Demo Accounts

现有 admin/alex 演示账号不受影响。

The existing admin/alex demo accounts are unaffected.
