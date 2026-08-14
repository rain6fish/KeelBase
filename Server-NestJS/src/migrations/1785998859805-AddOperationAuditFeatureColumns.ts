import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOperationAuditFeatureColumns1785998859805 implements MigrationInterface {
    name = 'AddOperationAuditFeatureColumns1785998859805'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "operation_audit_logs" ADD "feature_key" varchar(64)`);
            await queryRunner.query(`ALTER TABLE "operation_audit_logs" ADD "feature_fallback" varchar(128)`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_c96933898e7326717cdb1ebf71"`);
        await queryRunner.query(`CREATE TABLE "temporary_operation_audit_logs" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer, "action" varchar(32) NOT NULL, "method" varchar(8) NOT NULL, "path" varchar(255) NOT NULL, "target_id" varchar(64), "request_body" text, "ip" varchar(64), "user_agent" varchar(255), "status_code" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "feature_key" varchar(64), "feature_fallback" varchar(128))`);
        await queryRunner.query(`INSERT INTO "temporary_operation_audit_logs"("id", "user_id", "action", "method", "path", "target_id", "request_body", "ip", "user_agent", "status_code", "createdAt") SELECT "id", "user_id", "action", "method", "path", "target_id", "request_body", "ip", "user_agent", "status_code", "createdAt" FROM "operation_audit_logs"`);
        await queryRunner.query(`DROP TABLE "operation_audit_logs"`);
        await queryRunner.query(`ALTER TABLE "temporary_operation_audit_logs" RENAME TO "operation_audit_logs"`);
        await queryRunner.query(`CREATE INDEX "IDX_c96933898e7326717cdb1ebf71" ON "operation_audit_logs" ("user_id", "createdAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "operation_audit_logs" DROP COLUMN "feature_key"`);
            await queryRunner.query(`ALTER TABLE "operation_audit_logs" DROP COLUMN "feature_fallback"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_c96933898e7326717cdb1ebf71"`);
        await queryRunner.query(`ALTER TABLE "operation_audit_logs" RENAME TO "temporary_operation_audit_logs"`);
        await queryRunner.query(`CREATE TABLE "operation_audit_logs" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer, "action" varchar(32) NOT NULL, "method" varchar(8) NOT NULL, "path" varchar(255) NOT NULL, "target_id" varchar(64), "request_body" text, "ip" varchar(64), "user_agent" varchar(255), "status_code" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "operation_audit_logs"("id", "user_id", "action", "method", "path", "target_id", "request_body", "ip", "user_agent", "status_code", "createdAt") SELECT "id", "user_id", "action", "method", "path", "target_id", "request_body", "ip", "user_agent", "status_code", "createdAt" FROM "temporary_operation_audit_logs"`);
        await queryRunner.query(`DROP TABLE "temporary_operation_audit_logs"`);
        await queryRunner.query(`CREATE INDEX "IDX_c96933898e7326717cdb1ebf71" ON "operation_audit_logs" ("user_id", "createdAt") `);
    }

}
