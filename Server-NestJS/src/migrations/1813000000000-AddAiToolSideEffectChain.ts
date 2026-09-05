// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * G-3（§22.17 ① G-3，HS-11 覆盖副作用）：ai_tool_side_effects 加 prev_hash + hash（可空）。
 * 新行由 AiToolEffectsService 计算链 hash（历史行 null 不参与链；首个哈希行 genesis）。双方言均简单 ALTER ADD COLUMN。
 */
export class AddAiToolSideEffectChain1813000000000 implements MigrationInterface {
  name = 'AddAiToolSideEffectChain1813000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" ADD "prev_hash" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" ADD "hash" varchar(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "hash"`);
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "prev_hash"`);
  }
}
