// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * WEB-FRONT-4 强制改密：users 表加 must_change_password。
 * 手写最小增量迁移；postgres 侧由 PostgresIncrementalSchema 幂等补齐。
 */
export class AddMustChangePassword1788400000000 implements MigrationInterface {
    name = 'AddMustChangePassword1788400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "must_change_password" boolean NOT NULL DEFAULT (0)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "must_change_password"`);
    }
}
