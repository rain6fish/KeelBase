---
name: write-migration
description: 生成/校验 TypeORM 迁移（新实体或改列后必用；TypeORM 索引用 hash 名，禁止手写迁移）
---

# 写 TypeORM 迁移（EASY-6 ④）

## 铁律（EASY-2.2 结论）
- **禁止手写迁移文件**——TypeORM 的索引/唯一约束用 hash 名，手写必然与实体不一致，CI 迁移一致性校验会 flag。
- 一律用 `migration:generate` 生成。

## 生成迁移
```bash
cd Server-NestJS
npm run migration:generate -- src/migrations/Add<描述>
```
会对比实体与 DB，生成差量迁移（sqlite + postgres 双驱动都要覆盖）。

## 验证一致性（CI 会查）
```bash
# 用已提交迁移建库，再 generate 对比 → "No changes" 即通过
DB_TYPE=sqlite DB_PATH=./data/migcheck.sqlite JWT_SECRET=x NODE_ENV=test npm run migration:run --silent
DB_TYPE=sqlite DB_PATH=./data/migcheck.sqlite JWT_SECRET=x NODE_ENV=test npx typeorm-ts-node-commonjs migration:generate -d src/config/typeorm-data-source.ts src/migrations/_ConsistencyCheck
# 若生成文件说明有差异，修复实体或迁移；然后删除 _ConsistencyCheck.ts
rm -f data/migcheck.sqlite src/migrations/_ConsistencyCheck.ts
```

## 生产白名单
postgres 迁移清单是**单一权威源** `Server-NestJS/src/config/postgres-migrations.ts`（`POSTGRES_MIGRATION_GLOBS`）——运行时（app.module）与 CLI（typeorm-data-source）均由此派生；**不要再改 app.module.ts 的数组（已不存在）**。二选一：
- postgres 需要执行 → 在 `POSTGRES_MIGRATION_GLOBS` 加文件名子串 glob（形如 `*AddXxx*`）
- 仅 sqlite 需要（postgres 由基线/合并迁移覆盖）→ 在 `POSTGRES_EXCLUDED_MIGRATIONS` 登记文件名

守卫测试 `src/config/postgres-migrations.spec.ts` 会强制分区（每个迁移必被二者之一覆盖），漏登记即测试红。

## 迁移文件规范
- 命名：`<timestamp>-Add<Name>.ts`（时间戳递增，用 `migration:create` 或 generate 自动生成）
- **时间戳须晚于所有触碰同一张表的迁移**：sqlite 加列走「临时表重建 + RENAME」，会**丢掉该表原有索引**；若本迁移建索引而时间戳早于后续某次表重建，索引会被抹掉（迁移表显示已执行但库里没有，且 `migration:generate` 报假漂移）。generate 用 `Date.now()`，可能小于仓库既有最大时间戳——生成后核对并在必要时改名到最大之后
- 双驱动：`if (queryRunner.connection.options.type === 'postgres') { ... return; }` 结构
- 列名用下划线（TypeORM 默认映射），camelCase 会不一致
- 全部源码文件带 `// SPDX-License-Identifier: Apache-2.0` 头（generate 产物需手动补）
