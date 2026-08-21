import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAiAuditIdentity1787286579684 implements MigrationInterface {
    name = 'AddAiAuditIdentity1787286579684'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD COLUMN "agent_id" varchar`);
            await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD COLUMN "session_id" varchar`);
            return;
        }
        // sqlite 表重建：只复制本迁移执行时已存在的列（基表列）——feedback/feedback_note/prev_hash/hash
        // 由更晚的 AddAiFeedback / AddAuditHashChain 迁移 ALTER 添加，本迁移时间戳在其前，
        // 重建不得引用它们，否则 migration:run 失败（release-gate 迁移一致性检查捕获）
        await queryRunner.query(`DROP INDEX "IDX_4ecf882f40e45cf9a917e2d93b"`);
        await queryRunner.query(`DROP INDEX "IDX_99dd9a25b4dee7a727982809b7"`);
        await queryRunner.query(`CREATE TABLE "temporary_ai_audit_logs" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "action" varchar(32) NOT NULL, "detail" text, "model" text, "provider" varchar(64), "prompt_tokens" integer, "completion_tokens" integer, "duration_ms" integer, "is_error" boolean NOT NULL DEFAULT (0), "error_message" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "agent_id" varchar, "session_id" varchar)`);
        await queryRunner.query(`INSERT INTO "temporary_ai_audit_logs"("id", "user_id", "conversation_id", "action", "detail", "model", "provider", "prompt_tokens", "completion_tokens", "duration_ms", "is_error", "error_message", "createdAt") SELECT "id", "user_id", "conversation_id", "action", "detail", "model", "provider", "prompt_tokens", "completion_tokens", "duration_ms", "is_error", "error_message", "createdAt" FROM "ai_audit_logs"`);
        await queryRunner.query(`DROP TABLE "ai_audit_logs"`);
        await queryRunner.query(`ALTER TABLE "temporary_ai_audit_logs" RENAME TO "ai_audit_logs"`);
        await queryRunner.query(`CREATE INDEX "IDX_4ecf882f40e45cf9a917e2d93b" ON "ai_audit_logs" ("user_id", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_99dd9a25b4dee7a727982809b7" ON "ai_audit_logs" ("conversation_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "agent_id"`);
            await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "session_id"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_99dd9a25b4dee7a727982809b7"`);
        await queryRunner.query(`DROP INDEX "IDX_4ecf882f40e45cf9a917e2d93b"`);
        await queryRunner.query(`ALTER TABLE "ai_audit_logs" RENAME TO "temporary_ai_audit_logs"`);
        await queryRunner.query(`CREATE TABLE "ai_audit_logs" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" varchar NOT NULL, "conversation_id" varchar, "action" varchar(32) NOT NULL, "detail" text, "model" text, "provider" varchar(64), "prompt_tokens" integer, "completion_tokens" integer, "duration_ms" integer, "is_error" boolean NOT NULL DEFAULT (0), "error_message" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "ai_audit_logs"("id", "user_id", "conversation_id", "action", "detail", "model", "provider", "prompt_tokens", "completion_tokens", "duration_ms", "is_error", "error_message", "createdAt") SELECT "id", "user_id", "conversation_id", "action", "detail", "model", "provider", "prompt_tokens", "completion_tokens", "duration_ms", "is_error", "error_message", "createdAt" FROM "temporary_ai_audit_logs"`);
        await queryRunner.query(`DROP TABLE "temporary_ai_audit_logs"`);
        await queryRunner.query(`CREATE INDEX "IDX_99dd9a25b4dee7a727982809b7" ON "ai_audit_logs" ("conversation_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_4ecf882f40e45cf9a917e2d93b" ON "ai_audit_logs" ("user_id", "createdAt") `);
    }

}
