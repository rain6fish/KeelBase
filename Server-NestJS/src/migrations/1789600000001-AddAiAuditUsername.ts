import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * D2-1c username 快照：ai_audit_logs 加 username 列（写审计时快照用户名）。
 * 独立治理库后审计查询无需左联业务 users 表。
 * 历史记录回填（user_id → users.username）。username 不参与哈希链 payload（同 agent_id/session_id，防破坏历史链）。
 */
export class AddAiAuditUsername1789600000001 implements MigrationInterface {
    name = 'AddAiAuditUsername1789600000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "username" varchar(64)`);
            // 历史回填（防 join users 表，独立库后无 users）
            await queryRunner.query(`UPDATE "ai_audit_logs" SET "username" = (SELECT u."username" FROM "users" u WHERE u."id" = CAST("ai_audit_logs"."user_id" AS INTEGER)) WHERE "username" IS NULL`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_99dd9a25b4dee7a727982809b7"`);
        await queryRunner.query(`DROP INDEX "IDX_4ecf882f40e45cf9a917e2d93b"`);
        await queryRunner.query(`CREATE TABLE "temporary_ai_audit_logs" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" varchar NOT NULL, "username" varchar(64), "conversation_id" varchar, "action" varchar(32) NOT NULL, "detail" text, "model" text, "provider" varchar(64), "prompt_tokens" integer, "completion_tokens" integer, "duration_ms" integer, "is_error" boolean NOT NULL DEFAULT (0), "error_message" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "agent_id" varchar, "session_id" varchar, "parent_action_id" varchar(64), "caller_agent_id" varchar(64), "delegation_context" varchar(512), "business_intent" varchar(255), "source" varchar(32), "feedback" varchar(16), "feedback_note" text, "prev_hash" varchar(64), "hash" varchar(64), "authorization" text)`);
        await queryRunner.query(`INSERT INTO "temporary_ai_audit_logs"("id", "user_id", "username", "conversation_id", "action", "detail", "model", "provider", "prompt_tokens", "completion_tokens", "duration_ms", "is_error", "error_message", "createdAt", "agent_id", "session_id", "parent_action_id", "caller_agent_id", "delegation_context", "business_intent", "source", "feedback", "feedback_note", "prev_hash", "hash", "authorization") SELECT "id", "user_id", NULL, "conversation_id", "action", "detail", "model", "provider", "prompt_tokens", "completion_tokens", "duration_ms", "is_error", "error_message", "createdAt", "agent_id", "session_id", "parent_action_id", "caller_agent_id", "delegation_context", "business_intent", "source", "feedback", "feedback_note", "prev_hash", "hash", "authorization" FROM "ai_audit_logs"`);
        await queryRunner.query(`DROP TABLE "ai_audit_logs"`);
        await queryRunner.query(`ALTER TABLE "temporary_ai_audit_logs" RENAME TO "ai_audit_logs"`);
        await queryRunner.query(`CREATE INDEX "IDX_99dd9a25b4dee7a727982809b7" ON "ai_audit_logs" ("conversation_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_4ecf882f40e45cf9a917e2d93b" ON "ai_audit_logs" ("user_id", "createdAt") `);
        // 历史回填（user_id → users.username；回填后 username 快照立即可用）
        await queryRunner.query(`UPDATE "ai_audit_logs" SET "username" = (SELECT u."username" FROM "users" u WHERE u."id" = CAST("ai_audit_logs"."user_id" AS INTEGER)) WHERE "username" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "username"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_4ecf882f40e45cf9a917e2d93b"`);
        await queryRunner.query(`DROP INDEX "IDX_99dd9a25b4dee7a727982809b7"`);
        await queryRunner.query(`ALTER TABLE "ai_audit_logs" RENAME TO "temporary_ai_audit_logs"`);
        await queryRunner.query(`CREATE TABLE "ai_audit_logs" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "action" varchar(32) NOT NULL, "detail" text, "model" text, "provider" varchar(64), "prompt_tokens" integer, "completion_tokens" integer, "duration_ms" integer, "is_error" boolean NOT NULL DEFAULT (0), "error_message" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "agent_id" varchar, "session_id" varchar, "parent_action_id" varchar(64), "caller_agent_id" varchar(64), "delegation_context" varchar(512), "business_intent" varchar(255), "source" varchar(32), "feedback" varchar(16), "feedback_note" text, "prev_hash" varchar(64), "hash" varchar(64), "authorization" text)`);
        await queryRunner.query(`INSERT INTO "ai_audit_logs"("id", "user_id", "conversation_id", "action", "detail", "model", "provider", "prompt_tokens", "completion_tokens", "duration_ms", "is_error", "error_message", "createdAt", "agent_id", "session_id", "parent_action_id", "caller_agent_id", "delegation_context", "business_intent", "source", "feedback", "feedback_note", "prev_hash", "hash", "authorization") SELECT "id", "user_id", "conversation_id", "action", "detail", "model", "provider", "prompt_tokens", "completion_tokens", "duration_ms", "is_error", "error_message", "createdAt", "agent_id", "session_id", "parent_action_id", "caller_agent_id", "delegation_context", "business_intent", "source", "feedback", "feedback_note", "prev_hash", "hash", "authorization" FROM "temporary_ai_audit_logs"`);
        await queryRunner.query(`DROP TABLE "temporary_ai_audit_logs"`);
        await queryRunner.query(`CREATE INDEX "IDX_4ecf882f40e45cf9a917e2d93b" ON "ai_audit_logs" ("user_id", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_99dd9a25b4dee7a727982809b7" ON "ai_audit_logs" ("conversation_id") `);
    }

}
