// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #4 副作用 resultType 支持生成模块：列 varchar(16) → varchar(64)。
 * 旗舰别名（event/todo/crm_task/pm_task/app_request/contract/proxy_call）均 <16；生成模块名为模块单数，
 * 模块名最长 30（validateModuleName），16 会在 postgres 溢出。
 * 时间戳须晚于 1795000000000-AddAiToolSideEffectSnapshots（该迁移会对本表做 sqlite 重建并硬编码 varchar(16)），
 * 否则会把本迁移的加长覆盖回 16。双方言：postgres 用 ALTER COLUMN；sqlite 不支持改列长 → 建临时表迁移数据重建。
 */
export class ExtendToolEffectResultTypeLen1797000000000 implements MigrationInterface {
    name = 'ExtendToolEffectResultTypeLen1797000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const isPg = queryRunner.connection.driver.options.type === 'postgres';
        if (isPg) {
            await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" ALTER COLUMN "result_type" TYPE varchar(64)`);
        } else {
            await queryRunner.query(`CREATE TABLE "temporary_ai_tool_side_effects" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "tool_name" varchar(64) NOT NULL, "args_hash" varchar(64) NOT NULL, "result_type" varchar(64) NOT NULL, "result_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "before_snapshot" text, "after_snapshot" text, CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`);
            await queryRunner.query(`INSERT INTO "temporary_ai_tool_side_effects"("id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot") SELECT "id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot" FROM "ai_tool_side_effects"`);
            await queryRunner.query(`DROP TABLE "ai_tool_side_effects"`);
            await queryRunner.query(`ALTER TABLE "temporary_ai_tool_side_effects" RENAME TO "ai_tool_side_effects"`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const isPg = queryRunner.connection.driver.options.type === 'postgres';
        if (isPg) {
            await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" ALTER COLUMN "result_type" TYPE varchar(16)`);
        } else {
            await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" RENAME TO "temporary_ai_tool_side_effects"`);
            await queryRunner.query(`CREATE TABLE "ai_tool_side_effects" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "idempotency_key" varchar(64) NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "tool_name" varchar(64) NOT NULL, "args_hash" varchar(64) NOT NULL, "result_type" varchar(16) NOT NULL, "result_id" integer NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "before_snapshot" text, "after_snapshot" text, CONSTRAINT "UQ_ai_tool_side_effects_key" UNIQUE ("idempotency_key"))`);
            await queryRunner.query(`INSERT INTO "ai_tool_side_effects"("id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot") SELECT "id", "idempotency_key", "user_id", "conversation_id", "tool_name", "args_hash", "result_type", "result_id", "created_at", "before_snapshot", "after_snapshot" FROM "temporary_ai_tool_side_effects"`);
            await queryRunner.query(`DROP TABLE "temporary_ai_tool_side_effects"`);
        }
    }
}
