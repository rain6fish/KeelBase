 # PostgreSQL 数据库配置指南
 
 本目录包含 KeelBase 项目生产环境 PostgreSQL 数据库的所有配置、脚本和最佳实践文档。
 
 ## 目录结构
 
 ```
 postgresql/
   README.md              # 本文件 — 数据库总览与快速入门
   scripts/
     init.sql             # 数据库初始 DDL（TypeORM 关闭 synchronize 时使用）
     seed.sql             # 开发/测试环境种子数据
     migration.sh         # TypeORM 迁移命令脚本
   config/
     postgresql.conf      # 生产环境 PostgreSQL 调优参考配置
     connection-pool.md   # 连接池最佳实践（源自项目文档规范）
   docker-compose.db.yml  # 本地开发 PostgreSQL 独立启动
 ```
 
 ## 快速入门
 
 ### 本地开发（Docker）
 
 ```bash
 # 启动 PostgreSQL
 docker-compose -f postgresql/docker-compose.db.yml up -d
 
 # 验证连接
 psql -h localhost -U postgres -d front -c "SELECT version();"
 ```
 
 ### 配置环境变量
 
 参考 `.env` 文件中的数据库配置段：
 
 ```env
 DB_TYPE=postgres
 DB_HOST=localhost
 DB_PORT=5432
 DB_NAME=front
 DB_USER=postgres
 DB_PASSWORD=postgres
 DB_POOL_MAX=20
 DB_POOL_MIN=5
 DB_POOL_IDLE_TIMEOUT=30000
 DB_POOL_CONNECTION_TIMEOUT=2000
 ```
 
 ## 环境变量说明
 
 | 变量 | 默认值 | 说明 |
 |------|--------|------|
 | `DB_TYPE` | `sqlite` | 设为 `postgres` 启用 PostgreSQL |
 | `DB_HOST` | `localhost` | 数据库主机地址 |
 | `DB_PORT` | `5432` | 数据库端口 |
 | `DB_NAME` | `front` | 数据库名称 |
 | `DB_USER` | `postgres` | 数据库用户名 |
 | `DB_PASSWORD` | `postgres` | 数据库密码 |
 | `DB_POOL_MAX` | `20` | 最大连接数（初期保守配置） |
 | `DB_POOL_MIN` | `5` | 最小空闲连接数 |
 | `DB_POOL_IDLE_TIMEOUT` | `30000` | 空闲连接超时(ms) |
 | `DB_POOL_CONNECTION_TIMEOUT` | `2000` | 获取连接超时(ms) |
 
 ## 生产环境清单
 
 - [ ] 修改 `DB_PASSWORD` 为强密码
 - [ ] 设置 `DB_POOL_MAX` 不超过 PostgreSQL `max_connections` 的 80%
 - [ ] 生产环境建议关闭 `synchronize`，使用迁移（migration）
 - [ ] 配置数据库备份策略
 - [ ] 启用 PostgreSQL 的 `ssl` 连接
 - [ ] 监控连接数和慢查询
