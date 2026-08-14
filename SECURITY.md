# Security Policy / 安全政策

KeelBase is a production-ready, AI-native full-stack application base built for **data sovereignty** and **private deployment**. We take security seriously. This document describes our supported versions, how we handle security issues, and the built-in security posture of the platform.

KeelBase 是一个面向**数据主权与私有化部署**的生产级、AI 原生全栈应用基座。我们高度重视安全。本文档说明受支持的版本、安全问题的处理流程，以及平台内置的安全能力。

---

## Supported Versions / 受支持的版本

This project is under active development (pre-1.0). Security fixes are applied to the `main` branch and released with the next version. We do not maintain long-term support (LTS) branches at this stage.

本项目处于活跃开发期（1.0 之前）。安全修复会应用到 `main` 分支并随下一版本发布。当前阶段不维护长期支持（LTS）分支。

| Version | Supported / 支持 |
|---------|-----------|
| main (development) | ✅ Latest fixes applied / 应用最新修复 |
| < latest release | ⚠️ Upgrade recommended / 建议升级 |

---

## Reporting a Vulnerability / 漏洞报告

**Please do not open a public GitHub issue for security vulnerabilities.**

**安全漏洞请勿直接提交公开 GitHub Issue。**

### Preferred: Private disclosure / 首选：私密披露

Send an email to: **[128766028+rain6fish@users.noreply.github.com](mailto:128766028+rain6fish@users.noreply.github.com)**

Please include the following information in your report / 请在你的报告中包含以下信息：

- **Affected component(s)** / 受影响组件（backend / Front-Flutter / Front-Taro / Web-Admin-Vue / Docker / docs）
- **Vulnerability type** / 漏洞类型（e.g. XSS, SQL injection, auth bypass, RCE, information disclosure…）
- **Steps to reproduce** / 复现步骤（尽量最小化）
- **Impact** / 影响范围（谁能利用、能达到什么效果）
- **Suggested fix (optional)** / 建议修复方案（可选）
- **Affected version(s)** / 受影响版本

If you prefer, you can encrypt the email using the PGP key below. / 如需要，可用下方 PGP 公钥加密邮件。

### What happens next / 后续流程

1. We acknowledge receipt within **72 hours** / 我们在 72 小时内确认收到
2. We investigate, confirm, and assess severity / 我们调查、确认并评估严重性
3. We develop a fix and coordinate disclosure with you / 我们开发修复并与你协调披露
4. After a fix is released, we credit you in the release notes (if you wish) / 修复发布后，我们会按你的意愿在发布说明中致谢

### Alternative / 备选

If email is not suitable, you may use the **private vulnerability reporting** feature on GitHub if enabled, or contact the maintainer via the project's [GitHub Discussions](https://github.com/rain6fish/KeelBase/discussions) **without** including exploit details.

如不便使用邮件，也可通过 GitHub 的**私密漏洞报告**功能（若已启用），或通过项目 [GitHub Discussions](https://github.com/rain6fish/KeelBase/discussions) 联系维护者（**不要**包含利用细节）。

---

## Scope / 范围

We consider the following in scope for security review / 以下内容在安全审查范围内：

- `Server-NestJS/` — NestJS backend (auth, authorization, API, file upload, AI agent harness) / NestJS 后端（认证、授权、API、文件上传、AI Agent 运行时）
- `Front-Flutter/` — Flutter app (iOS / Android / Web) / Flutter 主 App（三端）
- `Front-Taro/` and `Web-Admin-Vue/` — Taro H5 / mini-program app and Vue3 admin console / Taro 主 App 与管理台
- `Dockerfile`, `docker-compose*.yml`, `nginx*.conf` — deployment / 部署配置
- `deploy/` — deployment scripts / 部署脚本

Out of scope / 不在范围内：

- Vulnerabilities in **third-party dependencies** — please report them to the upstream project / 第三方依赖漏洞——请上报到上游项目
- Issues that require the attacker to already have access to the server / 攻击者已能访问服务器的情况
- Social engineering attacks on project maintainers / 对维护者的社工攻击

---

## Built-in Security Posture / 内置安全能力

The platform ships with the following security controls. Detailed rules are in [`CLAUDE.md`](./CLAUDE.md#5-安全规则必须遵守) §5.

平台内置以下安全控制，详细规则见 [`CLAUDE.md`](./CLAUDE.md#5-安全规则必须遵守) 第 5 节。

### Authentication / 认证
- Passwords: min 8 chars, must contain letters + digits, **bcrypt (12 rounds)** / 密码最短 8 位、须含字母数字、bcrypt 12 轮
- **Login lockout**: 10 consecutive failures → locked 15 minutes / 连续 10 次失败锁定 15 分钟
- **Refresh token rotation**: old token invalidated on every use / refresh token 每次使用后轮换、旧 token 立即失效
- Refresh tokens stored as **SHA-256 hashes**, never plaintext / refresh token 存 SHA-256 哈希，非明文
- **Enumeration protection**: identical response for unknown user vs. wrong password / 防枚举：用户不存在与密码错误返回相同提示
- **Timing attack protection**: random 200–500ms delay on auth failure / 认证失败随机延迟 200–500ms
- **Session clearing**: mismatched refresh token clears all sessions / refresh token 不匹配时清除所有会话
- **Static encryption**: phone / providerId encrypted with **AES-256-GCM**; providerId indexed via HMAC-SHA256 derived hash / 敏感字段 AES-256-GCM 加密存储

### Authorization / 授权
- **CASL** ability-based permissions with role + row-level ownership checks / CASL 能力模型 + 角色 + 行级所有权校验
- Admin-only endpoints guarded by `@CheckPolicies((a) => a.can('manage', 'all'))` / 管理端点 CASL 管理员保护
- **Admin data sanitization**: email/phone masked, sensitive fields excluded from admin responses / 管理端接口脱敏

### Request / API security / 请求安全
- **Helmet** security headers auto-injected / Helmet 安全头部自动注入
- JSON body limit ≤ 1MB / JSON body 限制 1MB
- **CORS** whitelist (production) / 生产 CORS 域名白名单
- **class-validator** whitelist — unknown fields rejected / 校验白名单剔除多余字段
- **Sort-injection guard** — sort param whitelist / sort 参数白名单防注入
- **Rate limiting**: global 60/min, stricter per sensitive endpoint (login/register/forgot-password) / 全局限流 + 敏感端点更严
- **SQL injection** defense: parameterized queries everywhere, audited in S.3 / 全参数化查询防 SQL 注入（S.3 已审计）

### File upload / 文件上传
- MIME + extension whitelist + **magic-byte validation** / MIME + 扩展名白名单 + 魔数校验
- 10MB max, failed uploads leave no disk residue / 最大 10MB、失败无磁盘残留
- Raster images auto-converted to **WebP** (max 1280px) / 光栅图自动转 WebP

### Deployment / 部署
- Docker runs as **non-root** user / Docker 非 root 运行
- **HSTS** + HTTPS in production / 生产启用 HTTPS + HSTS
- Swagger only in development / Swagger 仅开发环境
- Production: `synchronize: false`, `migrationsRun: true` / 生产模式关闭自动同步、启用迁移

### AI Agent harness security / AI Agent 安全
- **Tool calls scoped to logged-in user's data** / 工具调用限定登录用户数据范围
- **Write operations require human confirmation** (SSE confirmation protocol) / 写操作需人工确认
- CASL row-level checks on every agent action / 每个 Agent 动作 CASL 行级校验
- **Full audit trail**: ai_audit_logs + operation audit with sensitive fields redacted / 全链路审计 + 敏感字段打码

---

## Software Bill of Materials (SBOM) / 软件物料清单

An SBOM gives auditors a machine-readable inventory of third-party dependencies. Two ways to generate:

SBOM 为审计提供第三方依赖的机器可读清单，可通过两种方式生成：

### 1. Backend (npm) / 后端
```bash
cd Server-NestJS
npm install -g @cyclonedx/cyclonedx-npm   # once / 首次安装
cyclonedx-npm --output-file ../sbom.backend.json
```

### 2. Frontend (Flutter) / Flutter 前端
```bash
cd Front-Flutter
dart pub deps --json > ../sbom.frontend.json
```

### 3. All npm workspaces (Taro app + Vue3 admin) / 前端
```bash
cd Front-Taro && cyclonedx-npm --output-file ../sbom.taro.json
cd ../Web-Admin-Vue && cyclonedx-npm --output-file ../sbom.web-admin.json
```

Generated SBOMs should be committed or published alongside releases. For a quick **vulnerability scan** of backend dependencies:

生成的 SBOM 建议随发布一起提交或公开。快速**漏洞扫描**后端依赖：

```bash
cd Server-NestJS && npm audit
```

> ⚠️ `npm audit` may report issues in transitive dependencies. Evaluate each advisory in the context of how the package is used (many are dev-only or non-exploitable in our usage).
>
> ⚠️ `npm audit` 可能报告传递依赖的问题。请结合包的实际用途评估每条公告（很多是仅开发用或本项目场景不可利用）。

---

## Security-Focused Operations / 面向安全的运维

For production deployments, see also / 生产部署另见：

- [`docs/manual/operations.md`](docs/manual/operations.md) — backup/restore, observability, alerting / 备份恢复、可观测性、告警
- [`docs/manual/one-click-deploy.md`](docs/manual/one-click-deploy.md) — deployment with HTTPS / HTTPS 部署
- [`scripts/healthcheck.ts`](Server-NestJS/scripts/healthcheck.ts) — one-command health inspection / 一键健康巡检
- Key production env vars / 关键生产环境变量：
  - `JWT_SECRET`, `JWT_REFRESH_SECRET` — **min 32 chars**, rotate regularly / 最短 32 字符，定期轮换
  - `ENCRYPTION_KEY` — AES key for sensitive fields, `openssl rand -hex 32` / 敏感字段加密密钥
  - `CORS_ORIGINS` — set to your real domains in production / 生产设为真实域名白名单

---

## Acknowledgments / 致谢

We thank security researchers who help us keep the platform safe. If you report a valid vulnerability, we will credit you in release notes unless you prefer to remain anonymous.

感谢帮助维护平台安全的安全研究者。若你提交了有效漏洞，除非你希望保持匿名，否则我们会在发布说明中致谢。
