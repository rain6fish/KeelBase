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
新迁移需加入 `Server-NestJS/src/app.module.ts` 的 postgres migrations 白名单数组（`dist/migrations/*AddXxx*.js`），否则生产不执行。

## 迁移文件规范
- 命名：`<timestamp>-Add<Name>.ts`（时间戳递增，用 `migration:create` 或 generate 自动生成）
- 双驱动：`if (queryRunner.connection.options.type === 'postgres') { ... return; }` 结构
- 列名用下划线（TypeORM 默认映射），camelCase 会不一致
