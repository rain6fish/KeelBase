# PostgreSQL 生产迁移 — PostgresMigrations（部署前置） / PostgreSQL Production Migration — PostgresMigrations (Pre-deployment)

## 1. 概述 / Overview

既有迁移文件全部为 SQLite 方言（`AUTOINCREMENT`/`datetime('now')`），postgres 下 `migration:run` 失败。生产用 PostgreSQL（`migrationsRun: true`）需要独立可执行的迁移链。

All existing migration files are written in SQLite dialect (`AUTOINCREMENT`/`datetime('now')`), so `migration:run` fails under postgres. Production runs on PostgreSQL (`migrationsRun: true`) and requires a separate, executable migration chain.

**方案**：新增 postgres 独立基线迁移 + 按驱动过滤迁移加载。旧 sqlite 迁移文件不改（sqlite 仍走原链），postgres 走新链。

**Approach**: add an independent postgres baseline migration and filter migration loading by driver. The old sqlite migration files stay unchanged (sqlite keeps its original chain); postgres uses the new chain.

## 2. 迁移文件 / Migration Files

| 文件 / File | 驱动 / Driver | 内容 / Content |
|------|------|------|
| `1785800000000-PostgresInitialSchema.ts` | postgres | 全量基线（13 张表 + 外键 + 索引 + uuid-ossp/vector 扩展），**时间戳最早**保证先执行；sqlite 下 no-op / Full baseline (13 tables + foreign keys + indexes + uuid-ossp/vector extensions), **earliest timestamp** ensures it runs first; no-op under sqlite |
| `1785992463517-AddKnowledgeEmbeddings.ts` | postgres | 向量表（已有，自包含 `CREATE EXTENSION vector`）；sqlite 下 no-op / Vector table (existing, self-contained `CREATE EXTENSION vector`); no-op under sqlite |

> 时间戳规则：postgres 基线用 `1785800000000`（早于所有 sqlite 迁移的 `1785822337546`），TypeORM 按文件名排序执行，保证基线先建表。
> Timestamp rule: the postgres baseline uses `1785800000000` (earlier than all sqlite migrations' `1785822337546`), and TypeORM executes migrations sorted by filename, so the baseline creates tables first.

## 3. 迁移加载过滤 / Migration Loading Filter

三个 data source 的 postgres 分支只加载 postgres 迁移：

The postgres branch of all three data sources loads only postgres migrations:

```typescript
// typeorm-data-source.ts / app.module.ts / test/helpers.ts
migrations: [
  '*PostgresInitialSchema*',  // 需 +.replace(/\\/g, '/')（Windows 反斜杠 glob bug）
  '*AddKnowledgeEmbeddings*',
],
```

- sqlite 分支不变：`migrations: ['*{.ts,.js}']` 加载全部（含 postgres 迁移，但它们在 sqlite 下 no-op）
  The sqlite branch is unchanged: `migrations: ['*{.ts,.js}']` loads everything (including postgres migrations, but they are no-ops under sqlite)
- **Windows glob 坑**：tinyglobby 对 `resolve()` 生成的 `D:\...` 反斜杠绝对路径不匹配，需 `.replace(/\\/g, '/')`
  **Windows glob pitfall**: tinyglobby does not match the `D:\...` backslash absolute paths produced by `resolve()`, so you must apply `.replace(/\\/g, '/')`

## 4. 实体跨库类型修复 / Cross-Database Entity Type Fix

实体时间列从 `@Column({ type: 'datetime' })` 改为 `@Column({ type: Date })`：

Entity time columns are changed from `@Column({ type: 'datetime' })` to `@Column({ type: Date })`:

| 原因 / Reason | 说明 / Description |
|------|------|
| `datetime` | sqlite 支持，postgres 不支持（validateDataType 报错） / Supported by sqlite, not by postgres (validateDataType errors) |
| `timestamp` | postgres 支持，sqlite 不支持 / Supported by postgres, not by sqlite |
| `type: Date` | **双驱动都支持**，TypeORM 映射 sqlite→datetime、postgres→timestamp / **Supported by both drivers**; TypeORM maps sqlite→datetime and postgres→timestamp |

涉及 8 处：user.resetTokenExpiresAt / emailVerificationExpiresAt / lockedUntil、event.startTime / endTime、todo.dueDate、userSession.lastActiveAt / expiresAt。属性类型保持 `Date | null`（代码有显式 null 赋值）。

Affects 8 locations: user.resetTokenExpiresAt / emailVerificationExpiresAt / lockedUntil, event.startTime / endTime, todo.dueDate, userSession.lastActiveAt / expiresAt. The property types remain `Date | null` (the code has explicit null assignments).

## 5. 验证 / Verification

- postgres 空库 `migration:run`：2 个迁移全部成功（基线 → 向量）
  postgres empty DB `migration:run`: both migrations succeed (baseline → vector)
- **生产路径**（dist + migrationsRun）：`dist/config/typeorm-data-source.js` 加载 2 个迁移，空库 `front_prod` 建 13 张表成功
  **Production path** (dist + migrationsRun): `dist/config/typeorm-data-source.js` loads both migrations and creates all 13 tables in the empty `front_prod` database
- sqlite 回归：全量迁移（含 postgres no-op）+ CI `migration:generate` 一致性校验 "No changes" 通过
  sqlite regression: full migrations (including postgres no-ops) + CI `migration:generate` consistency check passes with "No changes"
- 单测 313 + e2e 81 全绿，lint 0 errors
  Unit tests 313 + e2e 81 all green, lint 0 errors

## 6. 后续 / Next Steps

- 新增实体时：sqlite 走 `migration:generate`（ts-node 下用 sqlite），postgres 需在空库再 generate 一次补 postgres 迁移（或改基线）
  When adding new entities: sqlite uses `migration:generate` (sqlite under ts-node); postgres requires generating once more against an empty database to produce the postgres migration (or update the baseline)
- 生产部署：`DB_TYPE=postgres + migrationsRun:true`，迁移自动执行
  Production deployment: `DB_TYPE=postgres + migrationsRun:true`, migrations run automatically
