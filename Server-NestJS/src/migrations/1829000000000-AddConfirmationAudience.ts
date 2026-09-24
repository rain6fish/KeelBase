// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AUTHZ-1（确认 artifact 的 audience 绑定，2026-09-24）：`ai_confirmation_requests` 加一列 `audience`。
 *
 * 解决的问题：该行绑住了**写什么**（`tool_name` + 精确 `args`），却从未绑住**写到哪**。委托 token
 * 有 `aud` 并由目标系统校验，确认 artifact 没有对应物 ⇒ 同一个 artifact 指向另一个目的地时依然有效，
 * 运行时手里没有任何东西可以校验它。本列记下签发时的目的地，执行点拿它与当时的目的地比对。
 *
 * **链外注解列**：不入任何哈希链 payload（`ai_confirmation_requests` 本就不在任何哈希链里），
 * 故既有链与既有行不受影响、不需重签。历史行为 null（列出现之前签发），run 行亦为 null
 * （成员在签发它的那次请求内执行，见 `ConfirmationStore.createRun`）。
 *
 * postgres / sqlite 均**简单 ALTER ADD COLUMN**（不建索引，故不必走 sqlite 的整表重建，同
 * AddConfirmationExecutionState 先例）。时间戳 1829000000000 晚于最新既有迁移 1828000000000。
 */
export class AddConfirmationAudience1829000000000 implements MigrationInterface {
  name = 'AddConfirmationAudience1829000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const varchar = queryRunner.connection.options.type === 'postgres' ? 'character varying' : 'varchar';
    await queryRunner.query(
      `ALTER TABLE "ai_confirmation_requests" ADD "audience" ${varchar}(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_confirmation_requests" DROP COLUMN "audience"`);
  }
}
