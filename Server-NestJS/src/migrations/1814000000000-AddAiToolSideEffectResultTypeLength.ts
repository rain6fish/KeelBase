// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * NC-4（pg migration-consistency 漂移修复）：ai_tool_side_effects.result_type 长度对齐。
 * 实体 @Column length:64 而原建表迁移 1788000000000（双方言）写成 varchar(16)——
 * sqlite 忽略长度故 sqlite 一致性绿，postgres 严格执行长度 → pg migration:generate 检漂移。
 * 本迁移把 pg 列 ALTER 到 64（数据安全，非 drop+add）；sqlite 无需处理（不强制长度）。
 */
export class AddAiToolSideEffectResultTypeLength1814000000000 implements MigrationInterface {
  name = 'AddAiToolSideEffectResultTypeLength1814000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "ai_tool_side_effects" ALTER COLUMN "result_type" TYPE character varying(64)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        `ALTER TABLE "ai_tool_side_effects" ALTER COLUMN "result_type" TYPE character varying(16)`,
      );
    }
  }
}
