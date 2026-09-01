// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1785822337546 implements MigrationInterface {
    name = 'InitialSchema1785822337546'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "username" varchar(32) NOT NULL, "email" varchar(255) NOT NULL, "password" varchar(255) NOT NULL, "firstName" varchar(64), "lastName" varchar(64), "nickname" varchar(64) NOT NULL, "phone" varchar(512), "dateOfBirth" date, "bio" varchar(512), "avatarUrl" varchar(256), "role" varchar(16) NOT NULL DEFAULT ('user'), "provider" varchar(32), "provider_id" varchar(512), "provider_hash" varchar(64), "refresh_token_hash" varchar(512), "login_attempts" integer NOT NULL DEFAULT (0), "locked_until" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`);
        await queryRunner.query(`CREATE TABLE "events" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "description" text, "startTime" datetime NOT NULL, "endTime" datetime NOT NULL, "location" varchar(200), "colorRole" integer NOT NULL DEFAULT (0), "isCancelled" boolean NOT NULL DEFAULT (0), "isRecurring" boolean NOT NULL DEFAULT (0), "userId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_7285fde447fa02fbe13a141eff" ON "events" ("userId", "startTime") `);
        await queryRunner.query(`CREATE TABLE "ai_audit_logs" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "action" varchar(32) NOT NULL, "detail" text, "model" text, "provider" varchar(64), "prompt_tokens" integer, "completion_tokens" integer, "duration_ms" integer, "is_error" boolean NOT NULL DEFAULT (0), "error_message" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_99dd9a25b4dee7a727982809b7" ON "ai_audit_logs" ("conversation_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_4ecf882f40e45cf9a917e2d93b" ON "ai_audit_logs" ("user_id", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "ai_conversations" ("id" varchar PRIMARY KEY NOT NULL, "user_id" varchar NOT NULL, "provider" varchar(64) NOT NULL, "model" varchar(64) NOT NULL, "message_count" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "last_activity_at" datetime, "is_deleted" boolean NOT NULL DEFAULT (0))`);
        await queryRunner.query(`CREATE TABLE "ai_messages" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "conversation_id" varchar NOT NULL, "role" varchar(32) NOT NULL, "content" text NOT NULL, "tool_call_id" varchar(64), "tool_name" varchar(64), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`DROP INDEX "IDX_7285fde447fa02fbe13a141eff"`);
        await queryRunner.query(`CREATE TABLE "temporary_events" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "description" text, "startTime" datetime NOT NULL, "endTime" datetime NOT NULL, "location" varchar(200), "colorRole" integer NOT NULL DEFAULT (0), "isCancelled" boolean NOT NULL DEFAULT (0), "isRecurring" boolean NOT NULL DEFAULT (0), "userId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_9929fa8516afa13f87b41abb263" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_events"("id", "title", "description", "startTime", "endTime", "location", "colorRole", "isCancelled", "isRecurring", "userId", "createdAt", "updatedAt") SELECT "id", "title", "description", "startTime", "endTime", "location", "colorRole", "isCancelled", "isRecurring", "userId", "createdAt", "updatedAt" FROM "events"`);
        await queryRunner.query(`DROP TABLE "events"`);
        await queryRunner.query(`ALTER TABLE "temporary_events" RENAME TO "events"`);
        await queryRunner.query(`CREATE INDEX "IDX_7285fde447fa02fbe13a141eff" ON "events" ("userId", "startTime") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_7285fde447fa02fbe13a141eff"`);
        await queryRunner.query(`ALTER TABLE "events" RENAME TO "temporary_events"`);
        await queryRunner.query(`CREATE TABLE "events" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "description" text, "startTime" datetime NOT NULL, "endTime" datetime NOT NULL, "location" varchar(200), "colorRole" integer NOT NULL DEFAULT (0), "isCancelled" boolean NOT NULL DEFAULT (0), "isRecurring" boolean NOT NULL DEFAULT (0), "userId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "events"("id", "title", "description", "startTime", "endTime", "location", "colorRole", "isCancelled", "isRecurring", "userId", "createdAt", "updatedAt") SELECT "id", "title", "description", "startTime", "endTime", "location", "colorRole", "isCancelled", "isRecurring", "userId", "createdAt", "updatedAt" FROM "temporary_events"`);
        await queryRunner.query(`DROP TABLE "temporary_events"`);
        await queryRunner.query(`CREATE INDEX "IDX_7285fde447fa02fbe13a141eff" ON "events" ("userId", "startTime") `);
        await queryRunner.query(`DROP TABLE "ai_messages"`);
        await queryRunner.query(`DROP TABLE "ai_conversations"`);
        await queryRunner.query(`DROP INDEX "IDX_4ecf882f40e45cf9a917e2d93b"`);
        await queryRunner.query(`DROP INDEX "IDX_99dd9a25b4dee7a727982809b7"`);
        await queryRunner.query(`DROP TABLE "ai_audit_logs"`);
        await queryRunner.query(`DROP INDEX "IDX_7285fde447fa02fbe13a141eff"`);
        await queryRunner.query(`DROP TABLE "events"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
