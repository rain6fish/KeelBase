// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * WEB-FRONT-4 MFA(TOTP)：users 表加 mfa_secret + mfa_enabled。
 * 手写最小增量迁移（仅加列，不跑生成器——见 AddAuditHashChain 说明）。
 * postgres 侧由 PostgresIncrementalSchema 幂等补齐。
 */
export class AddUserMfa1788300000000 implements MigrationInterface {
    name = 'AddUserMfa1788300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "mfa_secret" varchar(512)`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean NOT NULL DEFAULT (0)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfa_enabled"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfa_secret"`);
    }
}
