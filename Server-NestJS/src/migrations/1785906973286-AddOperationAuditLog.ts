import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOperationAuditLog1785906973286 implements MigrationInterface {
    name = 'AddOperationAuditLog1785906973286'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "operation_audit_logs" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer, "action" varchar(32) NOT NULL, "method" varchar(8) NOT NULL, "path" varchar(255) NOT NULL, "target_id" varchar(64), "request_body" text, "ip" varchar(64), "user_agent" varchar(255), "status_code" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_c96933898e7326717cdb1ebf71" ON "operation_audit_logs" ("user_id", "createdAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_c96933898e7326717cdb1ebf71"`);
        await queryRunner.query(`DROP TABLE "operation_audit_logs"`);
    }

}
