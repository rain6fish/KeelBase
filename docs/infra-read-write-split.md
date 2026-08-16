# 3.3 数据库读写分离 / Database Read/Write Splitting

> 适用：生产 PostgreSQL 读负载增长后。基于 TypeORM `replication`，**读自动路由从库、写走主库**。

## 配置 / Configuration

```bash
# 主库（写）
DB_TYPE=postgres
DB_HOST=db-primary
DB_PORT=5432
DB_NAME=front
DB_USER=front
DB_PASSWORD=***
# 只读副本（读），逗号分隔 "host1:5432,host2:5432"；留空 = 单库（向后兼容）
DB_READ_REPLICAS=db-replica-1:5432,db-replica-2:5432
```

- 未配置 `DB_READ_REPLICAS` → 单库连接（现有行为不变）。
- 配置后 → TypeORM `replication`：`find`/`queryBuilder` 读操作自动轮询从库，`save`/`update`/`delete` 写操作走主库。
- 迁移始终走主库（`typeorm-data-source.ts` 单连接，不读从库）。

## 生产部署 / Production Deployment

1. 用 PostgreSQL 流复制建只读副本：`pg_basebackup` 或托管商的 read replica。
2. 副本需与主库同 schema（迁移只跑主库，副本通过 WAL 追平）。
3. 从库连接复用主库凭据（同一 `DB_USER`/`DB_PASSWORD`/`DB_NAME`）。
4. 从库 `max_connections` 按读负载扩（每个 server 副本连接池 `DB_POOL_MAX`）。
5. 读一致性：写后立即读的场景可能读到旧数据（副本延迟）；需强一致的点用 `@Transactional({ readOnly: false })` 或直接查主库。

## 验证 / Verification

- 本地 sqlite 无法端到端验证 replication（TypeORM 仅 mysql/postgres 支持）。
- 生产/暂存验证：配置 `DB_READ_REPLICAS` 后，`SELECT` 走从库（pg_stat_activity 可见副本连接），写走主库。

## 局限 / Limitations

- 未做分库分表（sharding）——3.3 的「分库分表」部分需业务拆分后按表/租户路由，当前按单库主从实现。
- 写放大场景（高频写）仍需主库扩容；读写分离主要解读负载。
