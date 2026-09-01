// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * HS-11 审计哈希链：为 ai_audit_logs / operation_audit_logs 增加 prev_hash + hash 列。
 * 手写最小增量迁移（仅加列）：typeorm migration:generate 在当前迁移链下会混入既有
 * 约束命名漂移（可读名 vs TypeORM hash 名），不能产出干净 diff；纯加列用 ALTER 最稳。
 */
export class AddAuditHashChain1788200000000 implements MigrationInterface {
    name = 'AddAuditHashChain1788200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD COLUMN "prev_hash" varchar(64)`);
        await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD COLUMN "hash" varchar(64)`);
        await queryRunner.query(`ALTER TABLE "operation_audit_logs" ADD COLUMN "prev_hash" varchar(64)`);
        await queryRunner.query(`ALTER TABLE "operation_audit_logs" ADD COLUMN "hash" varchar(64)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "prev_hash"`);
        await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "hash"`);
        await queryRunner.query(`ALTER TABLE "operation_audit_logs" DROP COLUMN "prev_hash"`);
        await queryRunner.query(`ALTER TABLE "operation_audit_logs" DROP COLUMN "hash"`);
    }
}
