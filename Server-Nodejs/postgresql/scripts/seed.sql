 -- =============================================================
 -- Front 开发环境种子数据
 -- 用途: 快速填充测试数据
 -- 用法: psql -h localhost -U postgres -d front -f seed.sql
 -- =============================================================
 
 -- 注意: 密码为 bcrypt 哈希值，对应明文 "password123"
 -- 此哈希仅用于开发环境，生产环境请使用注册接口创建用户
 INSERT INTO "users" ("username", "password", "nickname")
 VALUES
     ('admin',    '$2b$10$8K1p/a0dL1LXMIgoEDFrwOfMQkf9Rn6bm1FZwOJK3v0pMl0IRLG2y', '管理员'),
     ('alice',    '$2b$10$8K1p/a0dL1LXMIgoEDFrwOfMQkf9Rn6bm1FZwOJK3v0pMl0IRLG2y', 'Alice Johnson'),
     ('bob',      '$2b$10$8K1p/a0dL1LXMIgoEDFrwOfMQkf9Rn6bm1FZwOJK3v0pMl0IRLG2y', 'Bob Smith')
 ON CONFLICT ("username") DO NOTHING;
