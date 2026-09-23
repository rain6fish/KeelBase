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
  type and the `enumLabels` key.
- **renaming or removing a key, or changing what an existing key means = MAJOR** — downstream must migrate.

- **新增字段类型 / 声明键 / 可选属性 = MINOR** —— 既有 spec 一律仍然合法，下游无需任何动作。
  `1.0` → `1.1` 即属此类：新增了 `decimal` 字段类型与 `enumLabels` 键。
- **改名、删除，或改变既有键的含义 = MAJOR** —— 下游必须迁移。

When a manifest is older than the CLI, `keelbase doctor` reports it and suggests re-running `keelbase init`,
which merges idempotently. That report is informational, not an error.

manifest 旧于当前 CLI 时，`keelbase doctor` 会报出并建议重跑 `keelbase init`（幂等合并）。该提示是**信息性**的，不是错误。

## Release lines / 版本线

| Line / 版本线 | Status / 状态 | Release trigger / 发布触发 |
|---|---|---|
| `1.0.x` | **Current — actively maintained / 当前维护线** | Continuous incremental releases / 持续增量发布 |
| `1.1.x` | **Pending / 待触发** — Product-Proof edition / 产品验证版 | External-validation milestones are met (no hard date) / 外部验证里程碑达成（无硬性日期） |
| `2.x` | Future / 未来 | Breaking changes, when accumulated / 破坏性变更累积后 |

### Current: 1.0.x / 当前：1.0.x

The current line is a mature, feature-complete application base. Releases are made incrementally as fixes
and small improvements land. The `main` branch is the development line; each tagged release is a stable
snapshot that passes the full CI and test suite.

当前版本线是功能完整的成熟基座。修复与小改进随代码合并增量发版。`main` 分支为开发线，每个打了 tag 的版本都是通过完整 CI 与测试套件的稳定快照。

### Pending: 1.1.x — Product-Proof edition / 待触发：1.1.x 产品验证版

v1.1 is a trigger-based release, **not a calendar release**. It ships when the product-proof milestones are
met — primarily: an external developer builds and runs KeelBase successfully, and early adopters / system
integrators provide real-world feedback that the product experience holds up outside the project's own
environment. Until those signals arrive, work continues on the `1.0.x` line with incremental releases.

v1.1 是**触发式发布，而非日历发布**。当产品验证里程碑达成时发布，核心标准：外部开发者成功构建并运行 KeelBase，且早期采用者/系统集成商提供的真实反馈验证了产品体验在项目自身环境之外依然成立。在这些信号到来之前，工作继续在 `1.0.x` 线上以增量发布推进。

## Release process / 发版流程

- **Changelog** — every user-visible change is recorded in [CHANGELOG.md](../CHANGELOG.md) / 所有可见变更记录在 [CHANGELOG.md](../CHANGELOG.md)
- **Releases** — tagged versions with release notes are published on GitHub [Releases](https://github.com/rain6fish/KeelBase/releases) / 带发布说明的 tagged 版本发布在 GitHub [Releases](https://github.com/rain6fish/KeelBase/releases)
- **Quality gate** — before any release: CI (lint, unit + E2E tests, builds), test-coverage thresholds, migration consistency (SQLite + PostgreSQL), and security checks must all pass / 任何版本发布前必须全部通过：CI（lint、单元 + E2E 测试、构建）、测试覆盖率门槛、迁移一致性（SQLite + PostgreSQL）、安全检查
- **Migrations** — schema changes always ship as versioned TypeORM migrations; no silent schema drift / 数据库结构变更始终以版本化 TypeORM 迁移发布，不允许静默漂移

## Supported versions / 受支持版本

Security fixes are applied to `main` and released with the next version. Before 1.0, the project does not
maintain long-term-support (LTS) branches — see [SECURITY.md](../SECURITY.md) for the exact policy.

安全修复应用到 `main` 并随下一版本发布。1.0 之前不维护长期支持（LTS）分支，具体策略见 [SECURITY.md](../SECURITY.md)。

---

*KeelBase · 公开版本计划 · Public version plan*
