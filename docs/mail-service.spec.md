# 邮件服务（PL-1）功能规格

> 基础设施服务：nodemailer/SMTP 封装 + 事务邮件模板。供 AU-1（密码重置）、AU-2（邮箱验证）等内部服务消费，不暴露 REST 端点。

## 1. 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `MAIL_ENABLED` | `false` | 是否启用邮件发送 |
| `SMTP_HOST` | `''` | SMTP 服务器地址 |
| `SMTP_PORT` | `465` | 465=SSL / 587=STARTTLS |
| `SMTP_SECURE` | `true` | 是否使用 TLS |
| `SMTP_USER` | `''` | 发件账号 |
| `SMTP_PASS` | `''` | 发件密码 |
| `SMTP_FROM` | `''` | 发件人显示，如 `ShiYu-AppBase <no-reply@example.com>` |

启用条件：`MAIL_ENABLED=true` 且 `SMTP_HOST` 非空。

## 2. 模板方法

`MailService` 暴露三个事务邮件方法（均返回 `Promise<void>`）：

| 方法 | 用途 | 内容 |
|------|------|------|
| `sendVerificationEmail(email, code)` | 注册/邮箱验证 | 6 位验证码，10 分钟有效（有效期由消费方控制） |
| `sendPasswordResetEmail(email, resetUrl)` | 重置密码 | 完整重置链接（由消费方拼接 `APP_BASE_URL`），30 分钟有效 |
| `sendNotificationEmail(email, title, body)` | 站内通知 | subject 前缀 `【ShiYu-AppBase】`，正文换行转 `<br/>` |

正文为内联样式中文 HTML，支持主要客户端。

## 3. 降级行为

- SMTP 未配置（`MAIL_ENABLED=false` 或 `SMTP_HOST` 为空）时，transport 注册为 `null`。
- `sendMail` / 模板方法在禁用时**记录日志后直接返回，不抛错**——调用方无需感知环境差异（dev 不配置也可开发）。

## 4. 消费约定

- 模块：`MailModule` 注册于 `app.module.ts`，`exports: [MailService]`。消费模块在 imports 引入 `MailModule` 后注入 `MailService` 即可。
- 密码重置链接由调用方用 `APP_BASE_URL`（前端地址）+ token 拼接后传入，MailService 不感知业务 URL。
- 测试：`mail.service.spec.ts` 覆盖禁用降级 / 启用发送 / 三个模板方法。

## 5. 后续

- AU-1（忘记密码）：消费 `sendPasswordResetEmail` + 重置 token 存储
- AU-2（邮箱验证）：消费 `sendVerificationEmail` + 验证码存储
