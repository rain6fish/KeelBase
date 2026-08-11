 -- =============================================================
 -- KeelBase 数据库初始化 DDL
 -- 用途: TypeORM 关闭 synchronize 时手动建表 / 生产环境部署
 -- 注意: TypeORM migrations 是推荐方式，此文件仅作参考和兜底
 -- =============================================================

 -- 创建数据库（需在 psql 中以超级用户执行）
 -- CREATE DATABASE front;

 -- 用户表
 CREATE TABLE IF NOT EXISTS "users" (
     "id"                INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
     "username"          VARCHAR(32)  NOT NULL UNIQUE,
     "password"          VARCHAR(255) NOT NULL,
     "nickname"          VARCHAR(64)  NOT NULL,
     "refresh_token_hash" VARCHAR(512),
     "loginAttempts"      INTEGER NOT NULL DEFAULT 0,
     "lockedUntil"        TIMESTAMP WITH TIME ZONE,
     "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
     "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
 );

 -- 索引
 CREATE INDEX IF NOT EXISTS idx_users_username ON "users" ("username");
 CREATE INDEX IF NOT EXISTS idx_users_created_at ON "users" ("createdAt");

 -- 更新时间触发器
 CREATE OR REPLACE FUNCTION update_updated_at_column()
 RETURNS TRIGGER AS $$
 BEGIN
     NEW."updatedAt" = NOW();
     RETURN NEW;
 END;
 $$ LANGUAGE plpgsql;

 DROP TRIGGER IF EXISTS trg_users_updated_at ON "users";
 CREATE TRIGGER trg_users_updated_at
     BEFORE UPDATE ON "users"
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column();

 -- 注释
 COMMENT ON TABLE "users" IS '用户表';
 COMMENT ON COLUMN "users"."password" IS 'bcrypt 哈希密码';
 COMMENT ON COLUMN "users"."refresh_token_hash" IS 'JWT refresh token SHA-256 哈希';
