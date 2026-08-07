# PostgreSQL 生产迁移 — PostgresMigrations（部署前置）

## 1. 概述

既有迁移文件全部为 SQLite 方言（`AUTOINCREMENT`/`datetime('now')`），postgres 下 `migration:run` 失败。生产用 PostgreSQL（`migrationsRun: true`）需要独立可执行的迁移链。

**方案**：新增 postgres 独立基线迁移 + 按驱动过滤迁移加载。旧 sqlite 迁移文件不改（sqlite 仍走原链），postgres 走新链。

## 2. 迁移文件

| 文件 | 驱动 | 内容 |
|------|------|------|
| `1785800000000-PostgresInitialSchema.ts` | postgres | 全量基线（13 张表 + 外键 + 索引 + uuid-ossp/vector 扩展），**时间戳最早**保证先执行；sqlite 下 no-op |
| `1785992463517-AddKnowledgeEmbeddings.ts` | postgres | 向量表（已有，自包含 `CREATE EXTENSION vector`）；sqlite 下 no-op |

> 时间戳规则：postgres 基线用 `1785800000000`（早于所有 sqlite 迁移的 `1785822337546`），TypeORM 按文件名排序执行，保证基线先建表。

## 3. 迁移加载过滤

三个 data source 的 postgres 分支只加载 postgres 迁移：

```typescript
// typeorm-data-source.ts / app.module.ts / test/helpers.ts
migrations: [
  '*PostgresInitialSchema*',  // 需 +.replace(/\\/g, '/')（Windows 反斜杠 glob bug）
  '*AddKnowledgeEmbeddings*',
],
```

- sqlite 分支不变：`migrations: ['*{.ts,.js}']` 加载全部（含 postgres 迁移，但它们在 sqlite 下 no-op）
- **Windows glob 坑**：tinyglobby 对 `resolve()` 生成的 `D:\...` 反斜杠绝对路径不匹配，需 `.replace(/\\/g, '/')`

## 4. 实体跨库类型修复

实体时间列从 `@Column({ type: 'datetime' })` 改为 `@Column({ type: Date })`：

| 原因 | 说明 |
|------|------|
| `datetime` | sqlite 支持，postgres 不支持（validateDataType 报错） |
| `timestamp` | postgres 支持，sqlite 不支持 |
| `type: Date` | **双驱动都支持**，TypeORM 映射 sqlite→datetime、postgres→timestamp |

涉及 8 处：user.resetTokenExpiresAt / emailVerificationExpiresAt / lockedUntil、event.startTime / endTime、todo.dueDate、userSession.lastActiveAt / expiresAt。属性类型保持 `Date | null`（代码有显式 null 赋值）。

## 5. 验证

- postgres 空库 `migration:run`：2 个迁移全部成功（基线 → 向量）
- **生产路径**（dist + migrationsRun）：`dist/config/typeorm-data-source.js` 加载 2 个迁移，空库 `front_prod` 建 13 张表成功
- sqlite 回归：全量迁移（含 postgres no-op）+ CI `migration:generate` 一致性校验 "No changes" 通过
- 单测 313 + e2e 81 全绿，lint 0 errors

## 6. 后续

- 新增实体时：sqlite 走 `migration:generate`（ts-node 下用 sqlite），postgres 需在空库再 generate 一次补 postgres 迁移（或改基线）
- 生产部署：`DB_TYPE=postgres + migrationsRun:true`，迁移自动执行
