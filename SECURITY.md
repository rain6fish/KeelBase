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

### Maintenance & Sustainability (KB-8) / 维护、兼容与可持续性

**Compatibility & upgrade path / 兼容边界与升级路径**
- 语义化版本（SemVer）：1.0.x 增量维护；升 1.1 由产品证明期验收触发（非时间表）。当前 pre-1.0：安全修复落 `main` 并随下一版本发布。
- 生成产物为**普通源码**（NestJS + 前端 + 权限 + 审计接线），不锁定平台——升级 = `npm run migration:run` 前滚 + 源码随仓库演进，无专有运行时升级负担。
- 端点契约保持统一（REST/SSE/WS + 统一响应包装 + camelCase + ISO8601）；对外能力表述与边界见本文档 Trust Boundaries。
- **LTS / 长期承诺**：计划于 1.1（产品证明达成）提供公开的兼容承诺与版本策略细化（含哪些契约三年不拆、安全修复节奏）；当前阶段如实标注「不维护 LTS 分支」。

**Sustainability metrics (measurable) / 可持续性三指标（可测）**
| 指标 Metric | 口径 Definition | 当前基线（2026-09）Baseline |
|---|---|---|
| 提交节奏 Commit cadence | 主仓近 30 天提交数（`git log --since`） | 高活跃（日均 ≥1 提交，公开可核） |
| 贡献者 Contributors | GitHub/Gitee `contributors`（代码提交者） | 以作者为主 + AI 协助；外部按需（真实可核） |
| 安全响应时限 Response SLA | 私密披露 → 确认 → 修复随发布（Reporting 流程） | 目标 **72h 确认**（见下文 Reporting） |

**Reference deployment / 参考部署（可试跑，非生产 SLA）**
- 演示环境 `https://demo.keelbase.com.cn`（三入口 `/user/` `/admin/` `/mobile/`，Let's Encrypt 自动续期）——用于产品演示与选型试用；每日重置演示数据，**不提供生产 SLA**。
- 自托管一键复现：
  - **权威路径（从源码完整复现）**：`./deploy/deploy.sh`（git clone → 一键部署 → 建管理员，见 `docs/manual/one-click-deploy.md`）；升级 = `git pull` + `docker compose build`。首次构建含 Flutter web 产物（10-20 分钟）。
  - **快捷镜像路径**：单容器 `docker run -p 3000:3000 ghcr.io/rain6fish/keelbase:latest`（随 `v*` tag 由 `.github/workflows/docker-publish.yml` 发布，含最近发布版——演示用，权威复现仍走 deploy.sh）。

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
- `Front-Taro/` and `Web-Admin-Vue/` — Taro H5 / mini-program app and Vue3 + Element Plus web host (workbench + admin console) / Taro 主 App 与 Web 端（工作台+管理台）
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

## Trust Boundaries — What KeelBase Does Not Promise / 信任边界与不承诺清单（Not-a-*）

The security controls above describe what KeelBase *does*. The list below states the boundaries — what it does **not** promise — so that "trust / tamper-evident / revoke / audit" claims are read at their true scope. Anything not listed here is also not claimed. Keep this list in sync with the public FAQ and the product-language glossary.

上面的安全控制说明 KeelBase「提供什么」。下表说明**边界**——它「不承诺」什么——让「信任 / 篡改即断链 / 撤销 / 审计」等表述都按真实范围理解。未列于此表的内容同样不作承诺。本清单与公开 FAQ、产品语言词汇表保持同步。

| # | Not promised / 不承诺 | Provided / 实际提供与边界 |
|---|---|---|
| N-1 | App-layer audit hash chain is not tamper-proof / non-repudiable **when an attacker also controls the database and runtime signing key (same trust domain)** (DBA / root can rewrite the DB and recompute the chain) / 攻击者同时掌握数据库与运行时签名密钥（同一信任域）时，应用层审计哈希链不承诺防篡改 / 不可抵赖（DBA / root 可改写库并重算链） | **Within-application** tamper-evidence: out-of-band DB writes that bypass the formal write path break the chain and are caught by `verify`; the evidence root binds auth snapshots + decision evidence + chain digests into one offline-verifiable file, pushing the single point of trust down. Not a substitute for OS/DB access control, key management and separation of duties / 提供**应用边界内**篡改即断链：绕过系统正式写路径的库改会破链，可被 `verify` 检出；evidence-root 将授权快照 + Decision Evidence + 各链摘要绑成单文件、可离线验签。不替代 OS/DB 访问控制、密钥管理与职责分离 |
| N-2 | Not a legal/regulatory "non-repudiable store" / 不承诺法律级 / 监管级「不可抵赖存储」 | Evidence package + hash chain + offline verification are **integrity evidence**; legal-grade forensics additionally requires external notarization / trusted timestamping / key custody (deployment-side duty) / 证据包 + 哈希链 + 离线验证是**完整性证据**；法律级取证须叠加外部公证 / 可信时间戳 / 密钥托管（部署方义务） |
| N-3 | Not a defense against an admin who holds host/DB root **and** equivalent application-side privileges / 不承诺防住「同时拥有宿主机 / 数据库 root 且具备应用侧同等权限」的管理员 | Addressed by deployment discipline: DB least privilege, separated audit keys, audit on a separate governance DB, backup retention / 此类威胁由部署纪律处理：DB 最小权限、审计密钥分离、审计落独立治理库、备份留痕 |
| N-4 | No **cross-system distributed transaction (2PC / strong consistency)**: on legacy Java / third-party call timeout or partial success, the target system is not guaranteed to roll back / 不承诺**跨系统分布式事务（2PC / 强一致）**：调用 legacy Java / 第三方接口超时或半成功时，不保证目标系统回滚 | Only side effects in KeelBase's **own data domain with declared compensation endpoints** are revocable; external systems are declared via a **capability matrix** (local-only / governed-write-with-compensation / read-only) and revoke state is shown honestly (e.g. "revoke state is on the Java side"). Not promising = not pretending / 只对**自身数据域 + 已声明补偿端点**的副作用可撤销；外部系统按**能力矩阵**分档（local-only / governed-write-with-compensation / read-only）如实标注，撤销态诚实展示（如「撤销态在 Java 侧」）。不承诺 = 不假装 |
| N-5 | Cannot conjure idempotency keys / compensation APIs for a legacy system that does not have them / 不承诺幂等键 / 补偿 API 能凭空赋予老系统（它没有的） | AI Bridge compensation depends on the target system exposing a compensation endpoint + idempotency per the revokePath convention; external writes without it are marked "best-effort compensation" or read-only / AI Bridge 补偿依赖目标系统按 revokePath 约定提供补偿端点 + 幂等；无此约定的外部写只标「尽力补偿」或设为只读 |
| N-6 | KeelBase audit is not a substitute for cross-system reconciliation / 不承诺把 KeelBase 审计当作跨系统「对账完成」 | Audit records calls and revoke actions truthfully; cross-system eventual consistency needs the enterprise's own reconciliation / compensation flow / 审计如实记录调用与撤销动作；跨系统最终一致需企业自身的对账 / 补偿流程 |
| N-7 | "Human confirmation" does not equal an operator **individually** reviewing every item of a bulk action; batch/plan-level confirmation is not yet provided / 不承诺「人工确认」等于业务人员**逐项**审查了每个批量动作；批量（计划级）确认尚未提供 | Current confirmation is per operation / per confirmation token; plan-level (run-level) approval — AI proposes an operation plan, a human reviews a diff summary + risk tier and authorizes a run — is on the roadmap / 当前确认为逐操作 / 按确认 token；计划级确认（run-level approval：AI 先出操作计划、人审 diff 摘要 + 风险分层）为 roadmap 项（KB-5） |
| N-8 | Risk-tier auto-allow (R0-R5) is not a **business-correctness** verdict / 不承诺风险分级（R0-R5）自动放行 = **业务正确性**判定 | A risk tier expresses the default danger of a write + gating policy; whether a tool *should* execute a business action needs the business-rule layer — CASL handles authorization, business rules live in the service / policy layer, the two are not conflated / 风险级只表达写操作默认危险度 + 门控策略；某工具是否应执行某业务动作需业务规则层判定——CASL 管授权、业务规则在 service / 策略层，二者不混 |
| N-9 | Hash chain / audit logs are not, by themselves, a compliance qualification (等保 / 密评 / SOC …) / 不承诺哈希链 / 审计日志本身即合规资质 | Audit evidence is supporting material; qualification passes are done by the customer with deployment partners / 审计证据是配合材料；测评通过与资质由客户在部署伙伴协助下完成 |
| N-10 | Audit does not cover direct DB modifications that bypass the system's formal paths / 不承诺审计覆盖「绕过系统正式路径的直接数据库修改」 | Covers every write path inside the system (REST / AI tools / MCP / Bridge / SSE …); out-of-band DB writes are deployment discipline (N-1 / N-3) / 覆盖系统内一切写路径（REST / AI 工具 / MCP / Bridge / SSE 等）；库外直改属部署纪律（N-1 / N-3） |
| N-11 | No ready ecosystem / third-party connectors / independent third-party security audit yet / 不承诺社区生态 / 第三方连接器 / 独立第三方安全审计已就绪 | Currently author-maintained + self-verified; public SECURITY disclosure process, LTS and compatibility commitments are roadmap items (KB-8). Assess single-maintainer risk when selecting / 当前以作者维护 + 自证为主；公开 SECURITY 披露流程 / LTS 与兼容承诺为 roadmap 项（KB-8）。选型请按单点维护风险评估 |
| N-12 | No full Java-native edition / 不承诺 Java 原生全套 | Existing-system access via OpenAPI / MCP / bridge proxy; the Java starter is an access-layer integration; a full Java port is demand-triggered / 存量系统接入走 OpenAPI / MCP / 代理桥；Java starter 为接入层；整体 Java 移植由需求信号触发 |
| N-13 | Not all Renderers are maintained in lockstep / 不承诺所有 Renderer 同步同等维护 | Primary front-end = Vue web host (workbench + admin console one shell); Flutter = primary mobile app; React preview / Taro positioning & maintenance commitment is stated before 1.1 (KB-7) / 主前端 = Vue Web 宿主（工作台 + 管理台同一壳）；Flutter = 移动主 App；React preview / Taro 的定位与维护承诺在 1.1 前表态（KB-7） |

> **How each item is verified / 每项如何复核（挂 spec / 测试引用，KB-2）**：
> - N-1 / N-2 / N-3 → 信任边界声明 [threat-model.md](docs/security/threat-model.md)；篡改即断链的可运行证明 = 证据根一键复现 [evidence-root.spec.md](docs/evidence-root.spec.md) §7（`npm run verify:evidence-root`） + `/audit/verify`（[hs11-audit-chain.spec.md](docs/hs11-audit-chain.spec.md)）
> - N-4 / N-6 → 外部撤销如实语义 = [failure-path-corpus.spec.md](docs/failure-path-corpus.spec.md) FP-7；跨系统一致边界见 [external-crm-demo](docs/manual/external-crm-demo.md) 与 [evidence README](docs/evidence/README.md) §2.7
> - N-5 → 补偿端点（revokePath）约定 = [java-compensation-example.md](docs/integrator-kit/java-compensation-example.md) + `Server-NestJS/src/ai/proxy/proxy-revoker.service.spec.ts`
> - N-7 → 计划级确认尚未提供 = [run-level-approval.spec.md](docs/run-level-approval.spec.md)；token 一次性防 replay = [failure-path-corpus.spec.md](docs/failure-path-corpus.spec.md) FP-2
> - N-8 → 治理策略 / 风险级 = [hs9-governance-policy.spec.md](docs/hs9-governance-policy.spec.md)
> - N-9 → 合规定位 = [enterprise-capabilities.md](docs/enterprise-capabilities.md)（Compliance Path）+ [compliance-mapping.md](docs/manual/compliance-mapping.md)
> - N-10 → 覆盖写路径范围 = [hs11-audit-chain.spec.md](docs/hs11-audit-chain.spec.md)（含 operation-audit 覆盖，见 `Server-NestJS/test/`）
> - N-11 → 维护与披露现状 = 本 SECURITY（Supported Versions → Maintenance & Sustainability 三指标 + Reporting 流程）+ [threat-model](docs/security/threat-model.md)
> - N-12 → Java 接入路径 = [integrator-kit](docs/integrator-kit/)（java-starter 为探针）
> - N-13 → 前端定位 = [product-language.md](docs/manual/product-language.md) + [architecture-boundary.md](docs/architecture-boundary.md)

> This list is derived from an adversarial review of the project's own claims (2026-09-07) and is mirrored in the public FAQ / 本清单源自对本项目自身表述的对抗性评审（2026-09-07），并与公开 FAQ 保持一致。

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
