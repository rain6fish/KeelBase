// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REV-6（撤销契约如实性，2026-09-24）：`ai_tool_side_effects` 加 `identity_incomplete`。
 *
 * effect 身份要同时承载**目标**（`result_type`/`result_id`，恒有值）与**变更**（`before_snapshot`/`after_snapshot`，
 * 可空）。缺了变更的身份答不出「两个补偿组是否做了同一变更」，只能答「碰了同一行」。本列把「这一行的身份
 * 缺了变更那半」标成**持久事实**，而不是让它在读取侧被默认为完整。
 *
 * **历史行回填的是「标注」，不是变更本身**：变更当时的样子无法从任何落库列重建（`before/after_snapshot`
 * 同为 null），故不去伪造；只按**既存列**如实标出「这些成组行本来就缺变更」。单目标行（无组）不参与
 * 跨组身份判定，故不标。
 *
 * **链外注解列**：不入任何哈希链 payload（`_chainPayload` 是白名单）—— 故不破既有链、不改既有行、不需重签。
 *
 * 时间戳 1829000000000 晚于最新既有迁移 1828000000000。postgres 与 sqlite 均**简单 ALTER ADD COLUMN**
 * （本迁移不建索引，故不必走 sqlite 的整表重建，同 AddRevokeDisputeAndAck 先例）。
 */
export class AddSideEffectIdentityIncomplete1829000000000 implements MigrationInterface {
  name = 'AddSideEffectIdentityIncomplete1829000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" ADD "identity_incomplete" boolean NOT NULL DEFAULT ${isPg ? 'false' : '0'}`,
    );
    // 历史成组行：登记时就没有变更快照的那些，如实标为身份不完整（只按既存列判定，不编造变更）
    await queryRunner.query(
      `UPDATE "ai_tool_side_effects" SET "identity_incomplete" = ${isPg ? 'true' : '1'}` +
        ` WHERE "compensation_group" IS NOT NULL AND "after_snapshot" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "identity_incomplete"`);
  }
}
