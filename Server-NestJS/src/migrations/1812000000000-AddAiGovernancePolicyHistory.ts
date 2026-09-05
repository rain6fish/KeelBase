// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P-③（§22.17 ① P-③，docs/policy-history-reproducible.spec.md）：ai_governance_policy_history 历史快照表
 * （每次 setPolicy 落一行：revision 内容指纹 + 规范化 value + applied_at；供跨版本回放）。
 * 双方言建表（pg SERIAL/TIMESTAMP；sqlite AUTOINCREMENT/datetime）。
 * applied_at 无 DEFAULT：与实体 @Column（无 default）对齐，service setPolicy 每次显式写入应用时点——
 * 若迁移带 DEFAULT 而实体不带，TypeORM 判漂移致 migration-consistency/release-gate CI 红（2026-09-05 修）。
 */
export class AddAiGovernancePolicyHistory1812000000000 implements MigrationInterface {
  name = 'AddAiGovernancePolicyHistory1812000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        `CREATE TABLE "ai_governance_policy_history" ("id" SERIAL PRIMARY KEY, "revision" varchar(16) NOT NULL, "value" text NOT NULL, "applied_at" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now())`,
      );
      await queryRunner.query(`CREATE INDEX "IDX_gph_revision" ON "ai_governance_policy_history" ("revision")`);
      await queryRunner.query(`CREATE INDEX "IDX_gph_applied_at" ON "ai_governance_policy_history" ("applied_at")`);
      return;
    }
    await queryRunner.query(
      `CREATE TABLE "ai_governance_policy_history" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "revision" varchar(16) NOT NULL, "value" text NOT NULL, "applied_at" datetime NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_gph_revision" ON "ai_governance_policy_history" ("revision")`);
    await queryRunner.query(`CREATE INDEX "IDX_gph_applied_at" ON "ai_governance_policy_history" ("applied_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_governance_policy_history"`);
  }
}
