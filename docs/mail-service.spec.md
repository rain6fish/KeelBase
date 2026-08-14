# 邮件服务（PL-1）功能规格 / Mail Service (PL-1) Functional Specification

> 基础设施服务：nodemailer/SMTP 封装 + 事务邮件模板。供 AU-1（密码重置）、AU-2（邮箱验证）等内部服务消费，不暴露 REST 端点。
> Infrastructure service: nodemailer/SMTP wrapper + transactional email templates. Consumed by internal services such as AU-1 (password reset) and AU-2 (email verification); exposes no REST endpoints.

## 1. 配置 / Configuration

| 环境变量 / Env Variable | 默认值 / Default | 说明 / Description |
|----------|--------|------|
| `MAIL_ENABLED` | `false` | 是否启用邮件发送 / Whether mail sending is enabled |
| `SMTP_HOST` | `''` | SMTP 服务器地址 / SMTP server address |
| `SMTP_PORT` | `465` | 465=SSL / 587=STARTTLS |
| `SMTP_SECURE` | `true` | 是否使用 TLS / Whether to use TLS |
| `SMTP_USER` | `''` | 发件账号 / Sender account |
| `SMTP_PASS` | `''` | 发件密码 / Sender password |
| `SMTP_FROM` | `''` | 发件人显示，如 `KeelBase <no-reply@example.com>` / Sender display name, e.g. `KeelBase <no-reply@example.com>` |

启用条件：`MAIL_ENABLED=true` 且 `SMTP_HOST` 非空。

Enabling condition: `MAIL_ENABLED=true` and `SMTP_HOST` is not empty.

## 2. 模板方法 / Template Methods

`MailService` 暴露三个事务邮件方法（均返回 `Promise<void>`）：

`MailService` exposes three transactional mail methods (all return `Promise<void>`):

| 方法 / Method | 用途 / Purpose | 内容 / Content |
|------|------|------|
| `sendVerificationEmail(email, code)` | 注册/邮箱验证 / Registration / email verification | 6 位验证码，10 分钟有效（有效期由消费方控制） / 6-digit verification code, valid for 10 minutes (validity window controlled by the consumer) |
| `sendPasswordResetEmail(email, resetUrl)` | 重置密码 / Password reset | 完整重置链接（由消费方拼接 `APP_BASE_URL`），30 分钟有效 / Full reset link (joined with `APP_BASE_URL` by the consumer), valid for 30 minutes |
| `sendNotificationEmail(email, title, body)` | 站内通知 / In-app notification | subject 前缀 `【KeelBase】`，正文换行转 `<br/>` / subject prefixed with `【KeelBase】`; body newlines converted to `<br/>` |

正文为内联样式中文 HTML，支持主要客户端。

The body is inline-styled Chinese HTML, supporting the major clients.

## 3. 降级行为 / Degradation Behavior

- SMTP 未配置（`MAIL_ENABLED=false` 或 `SMTP_HOST` 为空）时，transport 注册为 `null`。
  When SMTP is not configured (`MAIL_ENABLED=false` or `SMTP_HOST` is empty), the transport is registered as `null`.
- `sendMail` / 模板方法在禁用时**记录日志后直接返回，不抛错**——调用方无需感知环境差异（dev 不配置也可开发）。
  When disabled, `sendMail` / the template methods **log and return directly without throwing** — callers need not be aware of environment differences (dev can be developed without configuration).

## 4. 消费约定 / Consumption Conventions

- 模块：`MailModule` 注册于 `app.module.ts`，`exports: [MailService]`。消费模块在 imports 引入 `MailModule` 后注入 `MailService` 即可。
  Module: `MailModule` is registered in `app.module.ts`, with `exports: [MailService]`. A consuming module imports `MailModule` and injects `MailService`.
- 密码重置链接由调用方用 `APP_BASE_URL`（前端地址）+ token 拼接后传入，MailService 不感知业务 URL。
  The password reset link is built by the caller with `APP_BASE_URL` (the frontend address) + token and passed in; MailService is unaware of the business URL.
- 测试：`mail.service.spec.ts` 覆盖禁用降级 / 启用发送 / 三个模板方法。
  Tests: `mail.service.spec.ts` covers disabled degradation / enabled sending / the three template methods.

## 5. 后续 / Follow-up

- AU-1（忘记密码）：消费 `sendPasswordResetEmail` + 重置 token 存储
  AU-1 (forgot password): consumes `sendPasswordResetEmail` + reset token storage
- AU-2（邮箱验证）：消费 `sendVerificationEmail` + 验证码存储
  AU-2 (email verification): consumes `sendVerificationEmail` + verification code storage
