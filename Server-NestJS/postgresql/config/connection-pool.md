 # 数据库连接池配置
 
 > 参考文档: 《1. 环境变量配置模板 (.env)》
 
 ## 核心原则
 
 1. **不要每次请求都 new Client()**，必须使用连接池
 2. **初期保守配置**，避免压垮单机数据库
 3. 用 Node.js 的连接池应对高并发，不给 PostgreSQL 太大压力
 
 ## 当前配置（TypeORM + pg）
 
 项目通过 TypeORM 的 `extra` 参数配置底层 `pg.Pool`：
 
 | 参数 | 当前值 | 说明 |
 |------|--------|------|
 | `DB_POOL_MAX` | 20 | 最大连接数，初期间不要超过 PG `max_connections` 的 80% |
 | `DB_POOL_MIN` | 5 | 最小空闲连接，减少首次请求握手延迟 |
 | `idleTimeoutMillis` | 30000 | 空闲 30 秒自动关闭，节省资源 |
 | `connectionTimeoutMillis` | 2000 | 2 秒内拿不到连接就报错，防止请求无限挂起 |
 
 ## 代码实现（src/app.module.ts）
 
 ```typescript
 extra: {
   max: configService.get<number>('DB_POOL_MAX', 20),
   min: configService.get<number>('DB_POOL_MIN', 5),
   idleTimeoutMillis: configService.get<number>('DB_POOL_IDLE_TIMEOUT', 30000),
   connectionTimeoutMillis: configService.get<number>('DB_POOL_CONNECTION_TIMEOUT', 2000),
 }
 ```
 
 ## 连接池最佳实践
 
 ### 事务处理
 
 使用 TypeORM `QueryRunner` 管理事务，不要在 Service 层直接操作 pg 连接：
 
 ```typescript
 // 示例: 转账事务
 const queryRunner = this.dataSource.createQueryRunner();
 await queryRunner.connect();
 await queryRunner.startTransaction();
 try {
   await queryRunner.manager.save(...);
   await queryRunner.manager.save(...);
   await queryRunner.commitTransaction();
 } catch (err) {
   await queryRunner.rollbackTransaction();
   throw err;
 } finally {
   await queryRunner.release();  // 必须释放！
 }
 ```
 
 ### 错误处理
 
 `pg.Pool` 会在连接丢失时自动重试。TypeORM 额外有 `retryAttempts`（默认 10 次）和 `retryDelay`（默认 3 秒）。
 
 ### 监控建议
 
 在生产环境建议监控以下指标：
 - 活跃连接数 (active connections)
 - 等待连接数 (waiting connections)
 - 连接池命中率
 - 慢查询 (>1s)
