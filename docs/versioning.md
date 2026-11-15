# Versioning / 版本策略

This page describes how KeelBase versions are numbered, released, and supported. It is the public version
plan for the project.

本页说明 KeelBase 的版本编号、发布与支持策略，是项目的公开版本计划。

---

## Versioning model / 版本模型

KeelBase follows [Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH`:

KeelBase 遵循 [语义化版本](https://semver.org/)（`主版本.次版本.修订号`）：

- **PATCH** — backward-compatible bug fixes and maintenance / 向后兼容的缺陷修复与维护
- **MINOR** — backward-compatible features / 向后兼容的新功能
- **MAJOR** — breaking changes / 不兼容的变更

### Application Protocol version / 应用协议版本

The Application Protocol carries its own version, recorded in `.keelbase/manifest.json` as `protocol` and
compared against the CLI by `keelbase doctor`. It moves independently of the product version:

应用协议自带版本号，记录在 `.keelbase/manifest.json` 的 `protocol` 字段，由 `keelbase doctor` 与 CLI 比对。
它与产品版本**独立演进**：

- **adding a field type, a declaration key or an optional attribute = MINOR** — every existing spec stays
  valid and downstream apps need do nothing. `1.0` → `1.1` is such a release: it added the `decimal` field
  type, module references (`ref`), personal-data declarations (`pii`), per-module attachment tables, and the
  `enumLabels` key.
- **renaming or removing a key, or changing what an existing key means = MAJOR** — downstream must migrate.

- **新增字段类型 / 声明键 / 可选属性 = MINOR** —— 既有 spec 一律仍然合法，下游无需任何动作。
  `1.0` → `1.1` 即属此类：新增了 `decimal` 字段类型、模块引用（`ref`）、个人数据声明（`pii`）、
  模块级附件表，以及 `enumLabels` 键。
- **改名、删除，或改变既有键的含义 = MAJOR** —— 下游必须迁移。

When a manifest is older than the CLI, `keelbase doctor` reports it and suggests re-running `keelbase init`,
which merges idempotently. That report is informational, not an error.

manifest 旧于当前 CLI 时，`keelbase doctor` 会报出并建议重跑 `keelbase init`（幂等合并）。该提示是**信息性**的，不是错误。

## Release lines / 版本线

| Line / 版本线 | Status / 状态 | Release trigger / 发布触发 |
|---|---|---|
| `1.4.x` | **Current — actively maintained / 当前维护线** | Continuous incremental releases / 持续增量发布 |
| `1.3.x` | **Superseded / 已被取代** — superseded by 1.4.0 / 已被 1.4.0 取代 | Upgrade to `1.4.x` / 升级到 `1.4.x` |
| `1.2.x` | **Superseded / 已被取代** — superseded by 1.3.0 / 已被 1.3.0 取代 | Upgrade to `1.4.x` / 升级到 `1.4.x` |
| `1.1.x` | **Superseded / 已被取代** — superseded by 1.2.0 / 已被 1.2.0 取代 | Upgrade to `1.4.x` / 升级到 `1.4.x` |
| `1.0.x` | **Superseded / 已被取代** — superseded by 1.1.0 / 已被 1.1.0 取代 | Upgrade to `1.4.x` / 升级到 `1.4.x` |
| `2.x` | Future / 未来 | Breaking changes, when accumulated / 破坏性变更累积后 |

### Current: 1.4.x — Accountable Evidence edition (continued) / 当前：1.4.x 可核证据版（续）

The 1.4.x line continues the Accountable Evidence edition. Its first release, v1.4.0 (2026-11-15),
carries the fixes prepared for 1.3.2 — the single-container image no longer ships built-in secrets,
webhook delivery is scoped to the event owner, the tool surface offered to the model follows the
caller, a truncated tool result stays valid JSON and is sanitized before it goes back to the model, the
audit object search states its scope, and AI Approval is presented as My Requests — together with one
new capability: a truncated tool result's full body is kept **off-chain** in `ai_tool_result_bodies`
and read back through `GET /api/v1/audit/logs/:id/tool-result`. The body is masked and hashed, expires
after `TOOL_RESULT_BODY_RETENTION_DAYS` (default 30) with only the tombstone remaining, and nothing
enters the audit hash payload, so the chain, `/audit/verify` and the evidence packages behave as
before. The `main` branch is the development line; each tagged release is a stable snapshot that passes
the full CI and test suite.

v1.4.1 (2026-11-15) is the line's first incremental release. It makes the email masking on the
retention and AI-input path linear, so a 256 KB line can no longer stall a reply; redacts the retained
model input by field name before storage; gives the tool surface offered to the model the same gate as
execution (feature flags, R5, verified email); and completes the admin console's retained-body panel
for the `capped` and not-retained states.

1.4.x 线延续可核证据版。其首个版本 v1.4.0（2026-11-15）带有原为 1.3.2 准备的修复——单容器镜像不再
内置密钥、Webhook 投递按事件归属收窄、喂给模型的工具面跟随调用者、截断的工具结果仍是合法 JSON 并在
回注模型前脱敏、审计对象检索写明口径、AI Approval 对外改称 My Requests——并加入一项新能力：被截断的
工具结果的完整正文以**链外**方式存入 `ai_tool_result_bodies`，可通过
`GET /api/v1/audit/logs/:id/tool-result` 读回。正文脱敏并带哈希，保留
`TOOL_RESULT_BODY_RETENTION_DAYS` 天（默认 30）后只留墓碑；留存内容不进入审计哈希 payload，审计链、
`/audit/verify` 与证据包行为不变。v1.4.1（2026-11-15）是本线首个增量版：留存与 AI 输入路径上的邮箱
脱敏改为线性，256 KB 单行不再拖住回答；留存里模型那份输入在落库前按字段名打码；喂给模型的工具面与
执行门共用同一判据（特性开关、R5、邮箱验证）；并补齐管理台留存正文面板在 `capped` 与未留存两种状态
下的说明。`main` 分支为开发线，每个打了 tag 的版本都是通过完整 CI 与测试套件的稳定快照。

### Superseded: 1.3.x — Accountable Evidence edition / 已被取代：1.3.x 可核证据版

v1.4.0 superseded the 1.3.x line on 2026-11-15; the text below is kept as history.

1.3.x 线于 2026-11-15 由 v1.4.0 取代，以下内容保留为历史。

The 1.3.x line was the Accountable Evidence edition, first released on 2026-10-31. It makes the audit
record accountable from both ends: an audit row links to the write claim that produced it and a
reachability reading says how many rows cannot be traced to one, a refused call gets its own counter, and
the explanation face names the authorization that actually let the write run. The readings instrument
takes seven action classes on one command and runs nightly in CI, alerting only. `v1.3.0` pinned the
contract at **v1.16.0**; `v1.3.1`, the line's first incremental release, moves it to **v1.21.0** as it
landed: **v1.18.0** carries the ordering declaration in `api-response` v2, **v1.19.0** adds the
outcome vector, **v1.20.0** publishes `audit-payload` v3 whose closed action enum gains
`audit_review` so a review receipt is a legal row on the same chain, and **v1.21.0** publishes
`audit-payload` v4, which adds `claim_release` for the row an operator leaves when releasing a write
hold whose outcome stayed unknown. The same release closes what an
audit reader can read back onto the scope that reader actually holds, and turns an unresolved write
into a readable, closable record. The `main` branch is the development line; each tagged release is a
stable snapshot that passes the full CI and test suite.

1.3.x 版本线是可核证据版，首发于 2026-10-31。它让审计记录两端都可核：审计行挂回产生它的那条写占位，
并有一条可达性读数说明有多少行追不到写占位；被拒的调用有自己的计数；解释面点名真正放行这次写入的
那次授权。读数仪器用一条命令取七类动作的读数，每夜在 CI 里跑、只告警。`v1.3.0` 把契约钉在
**v1.16.0**；`v1.3.1` 是本线的首个增量版，按落地时的实况把契约移到 **v1.21.0**：**v1.18.0** 承载
`api-response` v2 的排序声明，**v1.19.0** 新增结局向量，**v1.20.0** 发布 `audit-payload` v3 —— 其闭合的
action 枚举加上 `audit_review`，使复核回执成为同一条链上的合法行；**v1.21.0** 发布 `audit-payload` v4，
加上 `claim_release` —— 运维释放一份结局始终未知的写占位时留下的那一行。同一版还把审计读者能读回的东西
收口到该读者实际持有的范围之内，并让一次结局未明的写成为可读、可收口的记录。
`main` 分支为开发线，每个打了 tag 的版本都是通过完整 CI 与测试套件的稳定快照。

### Superseded: 1.2.x, 1.1.x and 1.0.x / 已被取代：1.2.x、1.1.x 与 1.0.x

v1.3.0 superseded the 1.2.x line on 2026-10-31; v1.2.0 superseded 1.1.x on 2026-10-18, and v1.1.0
superseded 1.0.x on 2026-10-05. No further `1.2.x`, `1.1.x` or `1.0.x` releases are planned: fixes and
security updates land on `main` and ship in the next `1.4.x` release. Upgrading to the current line is the
supported path.

1.3.0 于 2026-10-31 取代 1.2.x 线；1.2.0 于 2026-10-18 取代 1.1.x 线，1.1.0 于 2026-10-05 取代 1.0.x 线。
不再计划发布 `1.2.x`、`1.1.x` 或 `1.0.x` 版本：修复与安全更新落在 `main`，随下一个 `1.4.x` 版本发布。
升级到当前版本线是受支持的路径。

## Release process / 发版流程

- **Changelog** — every user-visible change is recorded in [CHANGELOG.md](../CHANGELOG.md) / 所有可见变更记录在 [CHANGELOG.md](../CHANGELOG.md)
- **Releases** — tagged versions with release notes are published on GitHub [Releases](https://github.com/rain6fish/KeelBase/releases) / 带发布说明的 tagged 版本发布在 GitHub [Releases](https://github.com/rain6fish/KeelBase/releases)
- **Quality gate** — before any release: CI (lint, unit + E2E tests, builds), test-coverage thresholds, migration consistency (SQLite + PostgreSQL), and security checks must all pass / 任何版本发布前必须全部通过：CI（lint、单元 + E2E 测试、构建）、测试覆盖率门槛、迁移一致性（SQLite + PostgreSQL）、安全检查
- **Migrations** — schema changes always ship as versioned TypeORM migrations; no silent schema drift / 数据库结构变更始终以版本化 TypeORM 迁移发布，不允许静默漂移

## Supported versions / 受支持版本

Security fixes are applied to `main` and released with the next version. The project does not maintain
long-term-support (LTS) branches for previous lines — running the current line is the supported
configuration. See [SECURITY.md](../SECURITY.md) for the exact policy.

安全修复应用到 `main` 并随下一版本发布。项目不为既往版本线维护长期支持（LTS）分支——运行当前版本线即受支持配置。具体策略见 [SECURITY.md](../SECURITY.md)。

---

*KeelBase · 公开版本计划 · Public version plan*
