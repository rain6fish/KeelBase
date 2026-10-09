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
| `1.1.x` | **Current — actively maintained / 当前维护线** | Continuous incremental releases / 持续增量发布 |
| `1.0.x` | **Superseded / 已被取代** — superseded by 1.1.0 / 已被 1.1.0 取代 | Upgrade to `1.1.x` / 升级到 `1.1.x` |
| `2.x` | Future / 未来 | Breaking changes, when accumulated / 破坏性变更累积后 |

### Current: 1.1.x — Product-Proof edition / 当前：1.1.x 产品证明版

The current line is the Product-Proof edition, first released on 2026-10-05. v1.1 was a trigger-based
release, **not a calendar release**: it shipped once the product-proof milestones were met — an external
developer builds and runs KeelBase from the public documentation, and the demo assets are in place. What the
release adds on top is checkability — a runtime whose claims about what it did can be verified. The `main`
branch is the development line; each tagged release is a stable snapshot that passes the full CI and test
suite. Releases are made incrementally as fixes and small improvements land.

当前版本线是产品证明版，首发于 2026-10-05。v1.1 是**触发式发布，而非日历发布**：产品验证里程碑达成后发布——外部开发者能按公开文档构建并运行 KeelBase，且演示资产就位。这一版在其上补的是**可核对**——一个对它做过什么的说法可以被验证的运行时。`main` 分支为开发线，每个打了 tag 的版本都是通过完整 CI 与测试套件的稳定快照。修复与小改进随代码合并增量发版。

### Superseded: 1.0.x / 已被取代：1.0.x

v1.1.0 superseded the 1.0.x line on 2026-10-05. No further `1.0.x` releases are planned: fixes and
security updates land on `main` and ship in the next `1.1.x` release. Upgrading to the current line is the
supported path.

1.1.0 于 2026-10-05 取代 1.0.x 线。不再计划发布 `1.0.x` 版本：修复与安全更新落在 `main`，随下一个 `1.1.x` 版本发布。升级到当前版本线是受支持的路径。

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
