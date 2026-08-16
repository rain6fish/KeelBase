import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSchemaConsistencyConstraints1786842976966 implements MigrationInterface {
    name = 'AddSchemaConsistencyConstraints1786842976966'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_2c8f1d6a9b3e5f7a0c1d4e6b8a"`);
        await queryRunner.query(`DROP INDEX "IDX_post_comments_post"`);
        await queryRunner.query(`DROP INDEX "IDX_5f6a7b8c9d0e1f2a3b4c5d6e7f8a"`);
        await queryRunner.query(`CREATE TABLE "temporary_post_likes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "post_id" integer NOT NULL, "user_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "temporary_post_likes"("id", "post_id", "user_id", "created_at") SELECT "id", "post_id", "user_id", "created_at" FROM "post_likes"`);
        await queryRunner.query(`DROP TABLE "post_likes"`);
        await queryRunner.query(`ALTER TABLE "temporary_post_likes" RENAME TO "post_likes"`);
        await queryRunner.query(`CREATE TABLE "temporary_user_follows" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "follower_id" integer NOT NULL, "followee_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "temporary_user_follows"("id", "follower_id", "followee_id", "created_at") SELECT "id", "follower_id", "followee_id", "created_at" FROM "user_follows"`);
        await queryRunner.query(`DROP TABLE "user_follows"`);
        await queryRunner.query(`ALTER TABLE "temporary_user_follows" RENAME TO "user_follows"`);
        await queryRunner.query(`CREATE TABLE "temporary_ai_daily_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" varchar NOT NULL, "usage_date" varchar(10) NOT NULL, "count" integer NOT NULL DEFAULT (0))`);
        await queryRunner.query(`INSERT INTO "temporary_ai_daily_usage"("id", "user_id", "usage_date", "count") SELECT "id", "user_id", "usage_date", "count" FROM "ai_daily_usage"`);
        await queryRunner.query(`DROP TABLE "ai_daily_usage"`);
        await queryRunner.query(`ALTER TABLE "temporary_ai_daily_usage" RENAME TO "ai_daily_usage"`);
        await queryRunner.query(`CREATE TABLE "notes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "content" text, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_7708dcb62ff332f0eaf9f0743a" ON "notes" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "tags" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(200) NOT NULL, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_74603743868d1e4f4fc2c0225b" ON "tags" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "flow_definitions" ("id" varchar(64) PRIMARY KEY NOT NULL, "name" varchar(100) NOT NULL, "version" varchar NOT NULL DEFAULT ('1.0'), "nodes_json" text NOT NULL, "audit" boolean NOT NULL DEFAULT (1), "confirmation_required" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE TABLE "flow_instances" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "definition_id" varchar NOT NULL, "state" varchar(20) NOT NULL DEFAULT ('pending'), "current_node_id" varchar, "data_json" text, "initiator_id" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
        await queryRunner.query(`CREATE TABLE "flow_tasks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "instance_id" integer NOT NULL, "node_id" varchar NOT NULL, "assignee_id" integer NOT NULL, "status" varchar(20) NOT NULL DEFAULT ('pending'), "decision_note" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_c6c385cabd9b8693912ac4c7d5" ON "post_comments" ("post_id", "created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8f64693922a9e8c4e2605850d0" ON "post_likes" ("post_id", "user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_254b7373cfa05319edbd8b8d9a" ON "user_follows" ("follower_id", "followee_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_3891edf7df68cc11ab7fe370bd" ON "ai_daily_usage" ("user_id", "usage_date") `);
        await queryRunner.query(`DROP INDEX "IDX_0d0be426ab7968539cb7785b54"`);
        await queryRunner.query(`CREATE TABLE "temporary_points_entries" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "points" integer NOT NULL, "reason" varchar(32) NOT NULL, "description" varchar(128), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "checkin_date" varchar(10), CONSTRAINT "UQ_47dd11fa7cb7fa605ed152a0784" UNIQUE ("user_id", "checkin_date"), CONSTRAINT "FK_8982f4807d82b988095541e9e80" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_points_entries"("id", "user_id", "points", "reason", "description", "createdAt", "updatedAt", "checkin_date") SELECT "id", "user_id", "points", "reason", "description", "createdAt", "updatedAt", "checkin_date" FROM "points_entries"`);
        await queryRunner.query(`DROP TABLE "points_entries"`);
        await queryRunner.query(`ALTER TABLE "temporary_points_entries" RENAME TO "points_entries"`);
        await queryRunner.query(`CREATE INDEX "IDX_0d0be426ab7968539cb7785b54" ON "points_entries" ("user_id", "createdAt") `);
        await queryRunner.query(`DROP INDEX "IDX_3891edf7df68cc11ab7fe370bd"`);
        await queryRunner.query(`CREATE TABLE "temporary_ai_daily_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" varchar NOT NULL, "usage_date" varchar(10) NOT NULL, "count" integer NOT NULL DEFAULT (0), CONSTRAINT "UQ_3891edf7df68cc11ab7fe370bdf" UNIQUE ("user_id", "usage_date"))`);
        await queryRunner.query(`INSERT INTO "temporary_ai_daily_usage"("id", "user_id", "usage_date", "count") SELECT "id", "user_id", "usage_date", "count" FROM "ai_daily_usage"`);
        await queryRunner.query(`DROP TABLE "ai_daily_usage"`);
        await queryRunner.query(`ALTER TABLE "temporary_ai_daily_usage" RENAME TO "ai_daily_usage"`);
        await queryRunner.query(`CREATE INDEX "IDX_3891edf7df68cc11ab7fe370bd" ON "ai_daily_usage" ("user_id", "usage_date") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_3891edf7df68cc11ab7fe370bd"`);
        await queryRunner.query(`ALTER TABLE "ai_daily_usage" RENAME TO "temporary_ai_daily_usage"`);
        await queryRunner.query(`CREATE TABLE "ai_daily_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" varchar NOT NULL, "usage_date" varchar(10) NOT NULL, "count" integer NOT NULL DEFAULT (0))`);
        await queryRunner.query(`INSERT INTO "ai_daily_usage"("id", "user_id", "usage_date", "count") SELECT "id", "user_id", "usage_date", "count" FROM "temporary_ai_daily_usage"`);
        await queryRunner.query(`DROP TABLE "temporary_ai_daily_usage"`);
        await queryRunner.query(`CREATE INDEX "IDX_3891edf7df68cc11ab7fe370bd" ON "ai_daily_usage" ("user_id", "usage_date") `);
        await queryRunner.query(`DROP INDEX "IDX_0d0be426ab7968539cb7785b54"`);
        await queryRunner.query(`ALTER TABLE "points_entries" RENAME TO "temporary_points_entries"`);
        await queryRunner.query(`CREATE TABLE "points_entries" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "points" integer NOT NULL, "reason" varchar(32) NOT NULL, "description" varchar(128), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "checkin_date" varchar(10), CONSTRAINT "FK_8982f4807d82b988095541e9e80" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "points_entries"("id", "user_id", "points", "reason", "description", "createdAt", "updatedAt", "checkin_date") SELECT "id", "user_id", "points", "reason", "description", "createdAt", "updatedAt", "checkin_date" FROM "temporary_points_entries"`);
        await queryRunner.query(`DROP TABLE "temporary_points_entries"`);
        await queryRunner.query(`CREATE INDEX "IDX_0d0be426ab7968539cb7785b54" ON "points_entries" ("user_id", "createdAt") `);
        await queryRunner.query(`DROP INDEX "IDX_3891edf7df68cc11ab7fe370bd"`);
        await queryRunner.query(`DROP INDEX "IDX_254b7373cfa05319edbd8b8d9a"`);
        await queryRunner.query(`DROP INDEX "IDX_8f64693922a9e8c4e2605850d0"`);
        await queryRunner.query(`DROP INDEX "IDX_c6c385cabd9b8693912ac4c7d5"`);
        await queryRunner.query(`DROP TABLE "flow_tasks"`);
        await queryRunner.query(`DROP TABLE "flow_instances"`);
        await queryRunner.query(`DROP TABLE "flow_definitions"`);
        await queryRunner.query(`DROP INDEX "IDX_74603743868d1e4f4fc2c0225b"`);
        await queryRunner.query(`DROP TABLE "tags"`);
        await queryRunner.query(`DROP INDEX "IDX_7708dcb62ff332f0eaf9f0743a"`);
        await queryRunner.query(`DROP TABLE "notes"`);
        await queryRunner.query(`ALTER TABLE "ai_daily_usage" RENAME TO "temporary_ai_daily_usage"`);
        await queryRunner.query(`CREATE TABLE "ai_daily_usage" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" varchar NOT NULL, "usage_date" varchar(10) NOT NULL, "count" integer NOT NULL DEFAULT (0), CONSTRAINT "UQ_1a2b3c4d5e6f7a8b9c0d1e2f3a4b" UNIQUE ("user_id", "usage_date"))`);
        await queryRunner.query(`INSERT INTO "ai_daily_usage"("id", "user_id", "usage_date", "count") SELECT "id", "user_id", "usage_date", "count" FROM "temporary_ai_daily_usage"`);
        await queryRunner.query(`DROP TABLE "temporary_ai_daily_usage"`);
        await queryRunner.query(`ALTER TABLE "user_follows" RENAME TO "temporary_user_follows"`);
        await queryRunner.query(`CREATE TABLE "user_follows" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "follower_id" integer NOT NULL, "followee_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_user_follows_pair" UNIQUE ("follower_id", "followee_id"))`);
        await queryRunner.query(`INSERT INTO "user_follows"("id", "follower_id", "followee_id", "created_at") SELECT "id", "follower_id", "followee_id", "created_at" FROM "temporary_user_follows"`);
        await queryRunner.query(`DROP TABLE "temporary_user_follows"`);
        await queryRunner.query(`ALTER TABLE "post_likes" RENAME TO "temporary_post_likes"`);
        await queryRunner.query(`CREATE TABLE "post_likes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "post_id" integer NOT NULL, "user_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_post_likes_post_user" UNIQUE ("post_id", "user_id"))`);
        await queryRunner.query(`INSERT INTO "post_likes"("id", "post_id", "user_id", "created_at") SELECT "id", "post_id", "user_id", "created_at" FROM "temporary_post_likes"`);
        await queryRunner.query(`DROP TABLE "temporary_post_likes"`);
        await queryRunner.query(`CREATE INDEX "IDX_5f6a7b8c9d0e1f2a3b4c5d6e7f8a" ON "ai_daily_usage" ("user_id", "usage_date") `);
        await queryRunner.query(`CREATE INDEX "IDX_post_comments_post" ON "post_comments" ("post_id", "created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2c8f1d6a9b3e5f7a0c1d4e6b8a" ON "points_entries" ("user_id", "checkin_date") `);
    }

}
