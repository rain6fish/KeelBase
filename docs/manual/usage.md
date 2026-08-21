# Usage Manual / 使用手册

> KeelBase — 面向最终用户的快速使用指南。
> For end users. Covers quick start, demo accounts, and all feature URLs.

Related manuals / 相关手册：
- [Quick Start / 快速上手（零基础）](quickstart.md)
- [FAQ / 常见问题](faq.md)
- [Development Manual / 开发手册](development.md)
- [Operations Manual / 运维手册](operations.md)

> 💡 第一次使用？先看 [快速上手（零基础 5 分钟跑通）](quickstart.md)，遇到问题查 [FAQ](faq.md)。本手册侧重功能与接口清单。

---

## 1. Quick Start / 快速启动

> 💡 **最快：一条命令**（统一入口，详见 [quickstart](quickstart.md)）
> ```bash
> ./scripts/dev.sh experience    # 起后端+管理台，自动验收 + 开浏览器
> ```
> 下面保留手动方式供了解各端细节。

### Backend / 后端

```bash
cd Server-NestJS
cp .env.example .env
npm install
npm run start:dev
# 或：./scripts/dev.sh dev
```

| Service | URL |
|---------|-----|
| API Server / API 服务 | http://localhost:3000 |
| Swagger API Docs / API 文档 | http://localhost:3000/api/docs |
| Health Check / 健康检查 | http://localhost:3000/api/v1/health |

### Flutter Frontend / Flutter 前端

```bash
cd Front-Flutter
flutter pub get
flutter run -d chrome   # Web
flutter run             # mobile
```

Frontend defaults to `http://localhost:3000/api/v1` / 前端默认对接 `http://localhost:3000/api/v1`。

### Admin Console / 管理台

> 单容器（`./scripts/docker-single.sh`）已内嵌管理台到 `/admin`，无需单独构建。以下为本地开发/独立部署路径。

```bash
cd Web-Admin-Vue
npm install
npm run dev          # Vite dev server → http://localhost:10086/admin/
```

| Console | URL |
|---------|-----|
| Admin Console / 管理台 | http://localhost:10086（本地）/ 生产 `http://<域名>/admin` |

---

## 2. Demo Accounts / 演示账号

Seeded automatically on first backend start (dev only) / 后端首次启动自动创建（仅开发环境）：

| Role / 角色 | Username / 用户名 | Password / 密码 | Purpose / 用途 |
|-------------|-------------------|-----------------|----------------|
| User / 普通用户 | `alex` | `123456` | Main app / 主 App |
| Admin / 管理员 | `admin` | `Admin@1234` | Admin console / 管理台 |

---

## 3. Feature URLs / 功能与 URL 清单

All API routes are prefixed `/api/v1`. Auth required unless marked. / 所有接口以 `/api/v1` 开头，除标注外均需登录。

### 3.1 Authentication / 认证

| Feature / 功能 | Method & Path / 方法与路径 | Notes / 说明 |
|----------------|---------------------------|--------------|
| Register / 注册 | POST `/auth/register` | 3 req/min |
| Login / 登录 | POST `/auth/login` | 20 req/min |
| Refresh token / 刷新令牌 | POST `/auth/refresh` | |
| Current user / 当前用户 | GET `/auth/me` | |
| OAuth login / 第三方登录 | POST `/auth/oauth` | Google/Apple/WeChat/Alipay |
| OAuth providers / 提供商列表 | GET `/auth/oauth/providers` | |
| Forgot password / 忘记密码 | POST `/auth/forgot-password` | 发送重置邮件 |
| Reset password / 重置密码 | POST `/auth/reset-password` | 邮件链接 token |
| Verify email / 邮箱验证 | POST `/auth/verify-email` | 6 位验证码 |
| Resend verification / 重发验证码 | POST `/auth/resend-verification` | |
| Logout / 登出 | POST `/auth/logout` | 当前设备 |
| Session list / 会话列表 | GET `/auth/sessions` | 多设备管理 |
| Remote logout / 远程登出 | DELETE `/auth/sessions/:id` | 指定设备 |

### 3.2 Users & Events / 用户与事件

| Feature / 功能 | Method & Path / 方法与路径 | Notes / 说明 |
|----------------|---------------------------|--------------|
| User list / 用户列表 | GET `/users` | ADMIN |
| Update role / 修改角色 | PATCH `/users/:id/role` | ADMIN |
| User detail / 用户详情 | GET `/users/:id` | 本人/管理员 |
| Update user / 更新用户 | PUT `/users/:id` | 本人/管理员 |
| Delete user / 删除用户 | DELETE `/users/:id` | 本人/管理员 |
| Create event / 创建事件 | POST `/events` | |
| List events / 事件列表 | GET `/events` | 范围查询，本人 |
| Event detail / 事件详情 | GET `/events/:id` | 本人/管理员 |
| Update event / 更新事件 | PUT `/events/:id` | 本人/管理员 |
| Delete event / 删除事件 | DELETE `/events/:id` | 本人/管理员 |
| All events / 全量事件 | GET `/events/admin/all` | ADMIN |
| Delete any event / 删除任意事件 | DELETE `/events/admin/:id` | ADMIN |

### 3.3 AI Assistant / AI 助手

| Feature / 功能 | Method & Path / 方法与路径 | Notes / 说明 |
|----------------|---------------------------|--------------|
| Chat / 对话 | POST `/ai/chat` | 30 req/min |
| Stream chat / 流式对话 | POST `/ai/chat/stream` | SSE |
| Data insights / 数据洞察 | POST `/ai/insights` | 事件统计聚合 |
| Conversation list / 对话历史 | GET `/ai/conversations` | |
| Single conversation / 单对话 | GET `/ai/conversations/:id` | |
| Delete conversation / 删对话 | DELETE `/ai/conversations/:id` | |
| Clear conversations / 清空 | DELETE `/ai/conversations` | |
| Knowledge list / 知识库列表 | GET `/ai/knowledge` | ADMIN，RAG 知识库 |
| Create knowledge / 创建知识 | POST `/ai/knowledge` | ADMIN |
| Update knowledge / 更新知识 | PATCH `/ai/knowledge/:id` | ADMIN |
| Delete knowledge / 删除知识 | DELETE `/ai/knowledge/:id` | ADMIN |

### 3.4 Notifications / 通知

| Feature / 功能 | Method & Path / 方法与路径 | Notes / 说明 |
|----------------|---------------------------|--------------|
| Notification list / 通知列表 | GET `/notifications` | 分页，本人 |
| Unread count / 未读数 | GET `/notifications/unread-count` | |
| Mark read / 标记已读 | PATCH `/notifications/:id/read` | |
| Mark all read / 全部已读 | PATCH `/notifications/read-all` | |
| Delete notification / 删除通知 | DELETE `/notifications/:id` | |
| Realtime stream / 实时推送 | POST `/notifications/stream` | SSE 长连接 |

### 3.5 Search, Upload, Push / 搜索、上传、推送

| Feature / 功能 | Method & Path / 方法与路径 | Notes / 说明 |
|----------------|---------------------------|--------------|
| Global search / 全局搜索 | GET `/search` | 本人事件 + 公开用户 |
| Upload file / 上传文件 | POST `/upload` | multipart，≤10MB |
| Register push token / 注册推送 | POST `/push/tokens` | |
| Unregister push token / 注销推送 | DELETE `/push/tokens/:token` | |

### 3.6 Admin & Ops / 管理与运维

| Feature / 功能 | Method & Path / 方法与路径 | Notes / 说明 |
|----------------|---------------------------|--------------|
| AI audit logs / AI 审计日志 | GET `/audit/logs` | ADMIN |
| AI usage stats / AI 用量统计 | GET `/audit/stats` | ADMIN |
| Operation audit / 操作审计 | GET `/audit/operations/logs` | ADMIN |
| Operation stats / 操作统计 | GET `/audit/operations/stats` | ADMIN |
| Health check / 健康检查 | GET `/health` | Public |
| Metrics / 指标 | GET `/metrics` | Prometheus |

---

## 4. Common Operations / 常见操作

### 4.1 Login & Register / 登录与注册

1. Open the app → splash auto-checks login / 打开 App → 启动页自动检测登录
2. Tap register / 点击注册 → fill username + password (8+ chars, letters + numbers) / 填写用户名 + 密码（至少 8 位，字母+数字）
3. Login with demo account `alex / 123456` / 用演示账号 `alex / 123456` 登录

### 4.2 Email Verification / 邮箱验证

1. Register with a valid email / 注册时填写有效邮箱
2. A 6-digit code is emailed / 邮箱收到 6 位验证码
3. Enter the code on the verification page / 在验证页输入验证码
4. Verify to unlock email-based features / 验证后解锁邮箱相关功能

> Note: email sending requires SMTP config (`MAIL_ENABLED=true`). Without it, registration proceeds but no email is sent / 需配置 SMTP 才真正发信，未配置时注册正常但不发邮件。

### 4.3 Forgot Password / 忘记密码

1. On login page tap "Forgot password" / 登录页点击"忘记密码"
2. Enter email → a reset link is sent / 输入邮箱 → 收到重置链接
3. Open the link → set a new password / 打开链接 → 设置新密码
4. Reset link valid 30 minutes / 重置链接 30 分钟内有效

### 4.4 Multi-Device Sessions / 多设备会话

1. Go to Profile → Sessions / 进入"我的" → 会话管理
2. View all logged-in devices / 查看所有登录设备
3. Remote-logout any device / 远程登出任意设备

### 4.5 AI Assistant / AI 助手

- Ask natural language questions, e.g. "What events do I have this month?" / 用自然语言提问，如"本月有哪些事件？"
- Switch models (DeepSeek/Qwen) via the model selector / 通过模型选择器切换 DeepSeek/Qwen
- View conversation history / 查看对话历史
- Admin can manage RAG knowledge base via admin console / 管理员可在管理台维护 RAG 知识库

#### AI 写操作确认（API 层）/ Write Confirmation (API)

写工具（如 `create_followup_task`）**不会静默执行**——需人工确认（token 60s TTL）。合成陌生人实测（W3）驱动补全操作层：

```bash
# 1. 流式对话触发写工具（SSE 流会在 confirmation_request 处挂起）
curl -N -X POST "$BASE/ai/chat/stream" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"为华润建材创建跟进任务"}'
# 观察事件：tool_start（写工具）→ confirmation_request（含 token）

# 2. 流保持打开的同时，从**另一个请求**完成确认（须并发，不能阻塞等 curl 结束）
curl -X POST "$BASE/ai/confirmations/<token>" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"decision":"approve"}'
# decision: "approve" | "decline"

# 3. 确认后流式收到 confirmation_decision + tool_end（resultId）→ 落库 + 审计
```

时序要点：确认 token **60s 过期**；对话流与确认**并发**；未确认或超时 → 写操作不执行（门控有效）；中文 body 用 UTF-8 文件（`curl --data @file.json`），避免 Windows GBK 乱码。

### 4.6 Admin Console / 管理台

1. 一键部署后访问 `http://<域名>/admin`；本地用 `./scripts/dev.sh dev-admin` / Production: visit `/admin` after one-click deploy; locally `./scripts/dev.sh dev-admin`
2. Login with `admin / Admin@1234` / 用 `admin / Admin@1234` 登录
3. Modules: overview, user management, event management, audit monitoring / 模块：概览、用户管理、事件管理、审计监控

---

## 5. Common Problems / 常见问题

| Problem / 问题 | Solution / 解决 |
|----------------|-----------------|
| Cannot login (locked) / 登录被锁定 | 连续 10 次失败锁定 15 分钟，稍后重试 / 10 fails → locked 15 min, retry later |
| Email not received / 收不到邮件 | 检查 SMTP 配置 `MAIL_ENABLED=true` / check SMTP config |
| Upload fails / 上传失败 | 文件需 ≤10MB，格式在 jpg/png/gif/webp/pdf/zip 内 / file ≤10MB, allowed formats |
| 403 on admin API / 管理接口 403 | 账号需 `role = admin` / account needs `role = admin` |
| App cannot reach API / App 连不上后端 | 确认后端已启动 / ensure backend is running |
