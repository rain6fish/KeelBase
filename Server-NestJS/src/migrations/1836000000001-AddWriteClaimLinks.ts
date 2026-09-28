// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ACT-5: the two references the claim row was missing — where its audit row is, and what authorized it.
 *
 * Both are chain-external annotations on `ai_write_claims` (that table is in no hash chain), added as
 * plain `ALTER TABLE ADD COLUMN` on both dialects, so nothing is rebuilt and no existing row changes.
 *
 * - `audit_row_id` is consumer ① — the evidence root pairs a business effect with **its own** trigger
 *   instead of the first same-named call in the conversation (and instead of the conservative "say
 *   nothing unless it is unambiguous" that ACT-2 had to settle for).
 * - `authorization_ref` is consumer ② — the confirmation or approval token this execution relied on,
 *   which closes REV-7: the window lives on the confirmation row and nothing pointed at it, so a
 *   single confirmation's window could not be answered from the record at all.
 *
 * **No backfill**: rows written before these columns have neither fact and neither can be
 * reconstructed — an effect keeps the conservative pairing rule, and a write with no recorded
 * authorization keeps `null`, which means "none was involved" rather than "unknown".
 *
 * Timestamp 1836000000001 is later than the claim table's own 1836000000000.
 *
 * ACT-5：占位行缺的那两条引用 —— 它的审计行在哪，以及它依据的是哪次授权。
 *
 * 两者都是 `ai_write_claims` 上的**链外注解列**（该表不入任何哈希链），双方言均为普通
 * `ALTER TABLE ADD COLUMN`，故不重建表、不改既有行。
 *
 * - `audit_row_id` 是消费者① —— 证据根把业务 effect 配到**它自己**那条触发行，而不是会话里第一条
 *   同名的 `tool_call`（也不再是 ACT-2 只能退守的「无歧义才说」）。
 * - `authorization_ref` 是消费者② —— 这次执行依据的确认 / 审批 token，闭合 REV-7：窗口住在确认行上而
 *   此前没有任何东西指向它，单条确认的窗口从记录上根本答不出来。
 *
 * **不回填**：本列之前的行两个事实都没有、也无法重建 —— 那些副作用继续走保守配对；没有记下授权的写
 * 保持 `null`，含义是「没有授权参与」而不是「未知」。
 *
 * 时间戳 1836000000001 晚于占位表自己的 1836000000000。
 */
export class AddWriteClaimLinks1836000000001 implements MigrationInterface {
  name = 'AddWriteClaimLinks1836000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const varchar = queryRunner.connection.options.type === 'postgres' ? 'character varying' : 'varchar';
    await queryRunner.query(`ALTER TABLE "ai_write_claims" ADD "audit_row_id" integer`);
    await queryRunner.query(`ALTER TABLE "ai_write_claims" ADD "authorization_ref" ${varchar}(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_write_claims" DROP COLUMN "authorization_ref"`);
    await queryRunner.query(`ALTER TABLE "ai_write_claims" DROP COLUMN "audit_row_id"`);
  }
}
