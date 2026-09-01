// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D.11 postgres 增量补全：补齐 sqlite 方言迁移链中未进 postgres 的表与约束名，
 * 使生产 postgres migrationsRun 后 schema 与实体完全一致。
 * 全部幂等（IF NOT EXISTS / DROP IF EXISTS / DO 块），可安全作用于已用 synchronize 建过的库。
 *
 * 来源：migration:generate 在 postgres 空库（25 个既有迁移后）产出的漂移 diff，改写成幂等形式。
 */
export class PostgresIncrementalSchema1789999999999 implements MigrationInterface {
  name = 'PostgresIncrementalSchema1789999999999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    // 1) 生成模块 + FLOW 表（sqlite 由 AddSchemaConsistencyConstraints 等建，postgres 从未建）
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "notes" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "content" text, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_af6206538ea96c4e77e9f400c3d" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_7708dcb62ff332f0eaf9f0743a" ON "notes" ("user_id")`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "tags" ("id" SERIAL NOT NULL, "name" character varying(200) NOT NULL, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_74603743868d1e4f4fc2c0225b" ON "tags" ("user_id")`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "flow_definitions" ("id" character varying(64) NOT NULL, "name" character varying(100) NOT NULL, "version" character varying NOT NULL DEFAULT '1.0', "nodes_json" text NOT NULL, "audit" boolean NOT NULL DEFAULT true, "confirmation_required" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4181d9e19be41300f7f5c8fcf1c" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "flow_instances" ("id" SERIAL NOT NULL, "definition_id" character varying NOT NULL, "state" character varying(20) NOT NULL DEFAULT 'pending', "current_node_id" character varying, "data_json" text, "initiator_id" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_d9bb606f96d8590f4a15f466f5a" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "flow_tasks" ("id" SERIAL NOT NULL, "instance_id" integer NOT NULL, "node_id" character varying NOT NULL, "assignee_id" integer NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'pending', "decision_note" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bea6c5c65d6de7eea70206b62ea" PRIMARY KEY ("id"))`);

    // 1.1) WEB-FRONT-4 MFA：users 表 mfa 列（幂等；sqlite 由 AddUserMfa 迁移加）
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_secret" character varying(512)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_enabled" boolean NOT NULL DEFAULT false`);
    // 1.2) WEB-FRONT-4 强制改密（幂等；sqlite 由 AddMustChangePassword 迁移加）
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean NOT NULL DEFAULT false`);

    // 2) 索引名对齐：可读名/占位名 → 实体 hash 名（DROP 旧 IF EXISTS + CREATE 新）
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_comments_post"`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_c6c385cabd9b8693912ac4c7d5" ON "post_comments" ("post_id", "created_at")`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_2c8f1d6a9b3e5f7a0c1d4e6b8a"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_5f6a7b8c9d0e1f2a3b4c5d6e7f8a"`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_8f64693922a9e8c4e2605850d0" ON "post_likes" ("post_id", "user_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_254b7373cfa05319edbd8b8d9a" ON "user_follows" ("follower_id", "followee_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_3891edf7df68cc11ab7fe370bd" ON "ai_daily_usage" ("user_id", "usage_date")`);

    // 3) 唯一约束对齐：占位/可读 constraint → 实体 hash constraint（DO 块幂等 ADD）
    await queryRunner.query(`ALTER TABLE "post_likes" DROP CONSTRAINT IF EXISTS "UQ_post_likes_post_user"`);
    await queryRunner.query(`ALTER TABLE "user_follows" DROP CONSTRAINT IF EXISTS "UQ_user_follows_pair"`);
    await queryRunner.query(`ALTER TABLE "ai_daily_usage" DROP CONSTRAINT IF EXISTS "UQ_1a2b3c4d5e6f7a8b9c0d1e2f3a4b"`);
    await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='UQ_47dd11fa7cb7fa605ed152a0784') THEN ALTER TABLE "points_entries" ADD CONSTRAINT "UQ_47dd11fa7cb7fa605ed152a0784" UNIQUE ("user_id", "checkin_date"); END IF; END $$;`);
    await queryRunner.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='UQ_3891edf7df68cc11ab7fe370bdf') THEN ALTER TABLE "ai_daily_usage" ADD CONSTRAINT "UQ_3891edf7df68cc11ab7fe370bdf" UNIQUE ("user_id", "usage_date"); END IF; END $$;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;

    await queryRunner.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='UQ_3891edf7df68cc11ab7fe370bdf') THEN ALTER TABLE "ai_daily_usage" DROP CONSTRAINT "UQ_3891edf7df68cc11ab7fe370bdf"; END IF; END $$;`);
    await queryRunner.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='UQ_47dd11fa7cb7fa605ed152a0784') THEN ALTER TABLE "points_entries" DROP CONSTRAINT "UQ_47dd11fa7cb7fa605ed152a0784"; END IF; END $$;`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_3891edf7df68cc11ab7fe370bd"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_254b7373cfa05319edbd8b8d9a"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_8f64693922a9e8c4e2605850d0"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_c6c385cabd9b8693912ac4c7d5"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "flow_tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "flow_instances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "flow_definitions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_74603743868d1e4f4fc2c0225b"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tags"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_7708dcb62ff332f0eaf9f0743a"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notes"`);
  }
}
