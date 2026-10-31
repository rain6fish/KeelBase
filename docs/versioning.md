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
| `1.3.x` | **Current — actively maintained / 当前维护线** | Continuous incremental releases / 持续增量发布 |
| `1.2.x` | **Superseded / 已被取代** — superseded by 1.3.0 / 已被 1.3.0 取代 | Upgrade to `1.3.x` / 升级到 `1.3.x` |
| `1.1.x` | **Superseded / 已被取代** — superseded by 1.2.0 / 已被 1.2.0 取代 | Upgrade to `1.3.x` / 升级到 `1.3.x` |
| `1.0.x` | **Superseded / 已被取代** — superseded by 1.1.0 / 已被 1.1.0 取代 | Upgrade to `1.3.x` / 升级到 `1.3.x` |
| `2.x` | Future / 未来 | Breaking changes, when accumulated / 破坏性变更累积后 |

### Current: 1.3.x — Accountable Evidence edition / 当前：1.3.x 可核证据版

The current line is the Accountable Evidence edition, first released on 2026-10-31. It makes the audit
record accountable from both ends: an audit row links to the write claim that produced it and a
reachability reading says how many rows cannot be traced to one, a refused call gets its own counter, and
the explanation face names the authorization that actually let the write run. The readings instrument
takes seven action classes on one command and runs nightly in CI, alerting only. The contract is pinned
at **v1.16.0**. The `main` branch is the development line; each tagged release is a stable snapshot that
passes the full CI and test suite.

当前版本线是可核证据版，首发于 2026-10-31。它让审计记录两端都可核：审计行挂回产生它的那条写占位，
并有一条可达性读数说明有多少行追不到写占位；被拒的调用有自己的计数；解释面点名真正放行这次写入的
那次授权。读数仪器用一条命令取七类动作的读数，每夜在 CI 里跑、只告警。契约钉在 **v1.16.0**。
`main` 分支为开发线，每个打了 tag 的版本都是通过完整 CI 与测试套件的稳定快照。

### Superseded: 1.2.x, 1.1.x and 1.0.x / 已被取代：1.2.x、1.1.x 与 1.0.x

v1.3.0 superseded the 1.2.x line on 2026-10-31; v1.2.0 superseded 1.1.x on 2026-10-18, and v1.1.0
superseded 1.0.x on 2026-10-05. No further `1.2.x`, `1.1.x` or `1.0.x` releases are planned: fixes and
security updates land on `main` and ship in the next `1.3.x` release. Upgrading to the current line is the
supported path.

1.3.0 于 2026-10-31 取代 1.2.x 线；1.2.0 于 2026-10-18 取代 1.1.x 线，1.1.0 于 2026-10-05 取代 1.0.x 线。
不再计划发布 `1.2.x`、`1.1.x` 或 `1.0.x` 版本：修复与安全更新落在 `main`，随下一个 `1.3.x` 版本发布。
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
