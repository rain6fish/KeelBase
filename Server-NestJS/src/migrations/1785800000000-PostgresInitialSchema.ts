// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

export class PostgresInitialSchema1785800000000 implements MigrationInterface {
    name = 'PostgresInitialSchema1785800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // postgres 专用基线；sqlite 走 InitialSchema 迁移，此迁移 no-op
        const dbType = (queryRunner.connection.options as any).type;
        if (dbType !== 'postgres') return;

        await queryRunner.query(`CREATE TABLE "user_sessions" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "refresh_hash" character varying(64) NOT NULL, "device_id" character varying(64), "device_name" character varying(128), "user_agent" character varying(255), "ip" character varying(64), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "last_active_at" TIMESTAMP, "expires_at" TIMESTAMP, CONSTRAINT "PK_e93e031a5fed190d4789b6bfd83" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e9658e959c490b0a634dfc5478" ON "user_sessions"  ("user_id") `);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "username" character varying(32) NOT NULL, "email" character varying(255) NOT NULL, "password" character varying(255) NOT NULL, "firstName" character varying(64), "lastName" character varying(64), "nickname" character varying(64) NOT NULL, "phone" character varying(512), "dateOfBirth" date, "bio" character varying(512), "avatarUrl" character varying(256), "role" character varying(16) NOT NULL DEFAULT 'user', "provider" character varying(32), "provider_id" character varying(512), "provider_hash" character varying(64), "refresh_token_hash" character varying(512), "reset_token_hash" character varying(64), "reset_token_expires_at" TIMESTAMP, "email_verified" boolean NOT NULL DEFAULT false, "email_verification_code" character varying(64), "email_verification_expires_at" TIMESTAMP, "login_attempts" integer NOT NULL DEFAULT '0', "locked_until" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "events" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "description" text, "startTime" TIMESTAMP NOT NULL, "endTime" TIMESTAMP NOT NULL, "location" character varying(200), "colorRole" integer NOT NULL DEFAULT '0', "isCancelled" boolean NOT NULL DEFAULT false, "isRecurring" boolean NOT NULL DEFAULT false, "reminder_minutes" integer, "userId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7285fde447fa02fbe13a141eff" ON "events"  ("userId", "startTime") `);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "title" character varying(200) NOT NULL, "body" text, "type" character varying(32) NOT NULL DEFAULT 'system', "target_type" character varying(32), "target_id" character varying(64), "is_read" boolean NOT NULL DEFAULT false, "link" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f8119e95a07eeea356486ed134" ON "notifications"  ("user_id", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "operation_audit_logs" ("id" SERIAL NOT NULL, "user_id" integer, "action" character varying(32) NOT NULL, "method" character varying(8) NOT NULL, "path" character varying(255) NOT NULL, "target_id" character varying(64), "request_body" text, "ip" character varying(64), "user_agent" character varying(255), "status_code" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8522e5aba5d88caf90bdb463493" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c96933898e7326717cdb1ebf71" ON "operation_audit_logs"  ("user_id", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "push_tokens" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "device_id" character varying(64), "platform" character varying(16) NOT NULL, "token" character varying(255) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_869b4a9ba2c9e030aafc4b7dc7a" UNIQUE ("token"), CONSTRAINT "PK_32734e87f299c29ca3878861f4f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_94c371aff70dedeb89dae39f44" ON "push_tokens"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_88a834039a1338d42063f8002d" ON "push_tokens"  ("user_id", "platform") `);
        await queryRunner.query(`CREATE TABLE "todos" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "description" text, "completed" boolean NOT NULL DEFAULT false, "due_date" TIMESTAMP, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ca8cafd59ca6faaf67995344225" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b13821410577fdeac87b7190a3" ON "todos"  ("user_id", "completed") `);
        await queryRunner.query(`CREATE TABLE "ai_audit_logs" ("id" SERIAL NOT NULL, "user_id" character varying NOT NULL, "conversation_id" character varying, "action" character varying(32) NOT NULL, "detail" text, "model" text, "provider" character varying(64), "prompt_tokens" integer, "completion_tokens" integer, "duration_ms" integer, "is_error" boolean NOT NULL DEFAULT false, "error_message" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1177e44bdc57719b14965dc8de0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_99dd9a25b4dee7a727982809b7" ON "ai_audit_logs"  ("conversation_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_4ecf882f40e45cf9a917e2d93b" ON "ai_audit_logs"  ("user_id", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "ai_conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "provider" character varying(64) NOT NULL, "model" character varying(64) NOT NULL, "message_count" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "last_activity_at" TIMESTAMP, "is_deleted" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_60db12765b82858ba00c8aa4ae2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ai_messages" ("id" SERIAL NOT NULL, "conversation_id" character varying NOT NULL, "role" character varying(32) NOT NULL, "content" text NOT NULL, "tool_call_id" character varying(64), "tool_name" character varying(64), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a390434d4a515ba18a41bc996c2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "ai_knowledge_articles" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "content" text NOT NULL, "category" character varying(64), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1745720fb3577a8595735529515" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "FK_9929fa8516afa13f87b41abb263" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const dbType = (queryRunner.connection.options as any).type;
        if (dbType !== 'postgres') return;

        await queryRunner.query(`ALTER TABLE "events" DROP CONSTRAINT "FK_9929fa8516afa13f87b41abb263"`);
        await queryRunner.query(`DROP TABLE "ai_knowledge_articles"`);
        await queryRunner.query(`DROP TABLE "ai_messages"`);
        await queryRunner.query(`DROP TABLE "ai_conversations"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4ecf882f40e45cf9a917e2d93b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_99dd9a25b4dee7a727982809b7"`);
        await queryRunner.query(`DROP TABLE "ai_audit_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b13821410577fdeac87b7190a3"`);
        await queryRunner.query(`DROP TABLE "todos"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_88a834039a1338d42063f8002d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_94c371aff70dedeb89dae39f44"`);
        await queryRunner.query(`DROP TABLE "push_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c96933898e7326717cdb1ebf71"`);
        await queryRunner.query(`DROP TABLE "operation_audit_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f8119e95a07eeea356486ed134"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7285fde447fa02fbe13a141eff"`);
        await queryRunner.query(`DROP TABLE "events"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e9658e959c490b0a634dfc5478"`);
        await queryRunner.query(`DROP TABLE "user_sessions"`);
    }

}
