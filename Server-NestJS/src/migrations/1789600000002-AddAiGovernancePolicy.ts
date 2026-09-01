// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * D2-1d 治理策略自有表：ai_governance_policy（单行 id=1，value JSON）。
 * 策略从 Settings 表迁出——治理台独立持有策略，不依赖业务 settings 表。
 */
export class AddAiGovernancePolicy1789600000002 implements MigrationInterface {
    name = 'AddAiGovernancePolicy1789600000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "ai_governance_policy" ("id" integer PRIMARY KEY NOT NULL, "value" text NOT NULL, "updated_at" TIMESTAMP NOT NULL DEFAULT now())`);
            // 从 settings 回填既有策略（key=ai_governance_policy），避免迁移丢配置
            await queryRunner.query(`INSERT INTO "ai_governance_policy" ("id", "value") SELECT 1, "value" FROM "settings" WHERE "key" = 'ai_governance_policy' ON CONFLICT ("id") DO NOTHING`);
            return;
        }
        await queryRunner.query(`CREATE TABLE "ai_governance_policy" ("id" integer PRIMARY KEY NOT NULL, "value" text NOT NULL, "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        // 从 settings 回填既有策略
        await queryRunner.query(`INSERT OR IGNORE INTO "ai_governance_policy" ("id", "value") SELECT 1, "value" FROM "settings" WHERE "key" = 'ai_governance_policy'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "ai_governance_policy"`);
    }

}
