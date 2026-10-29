// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AW-11: the forward edge from the audit row to its write claim.
 *
 * `ai_write_claims.audit_row_id` points claim → audit. That is the direction the evidence root needed
 * for attribution, but it leaves the most authoritative row type with nowhere to go: a reader who
 * starts at an audit row cannot reach the confirmation or the side-effect row at all. This column is
 * the other direction (audit → claim), so the walk is possible in both.
 *
 * Nullable, additive, reversible: a plain `ALTER TABLE ADD COLUMN` on both dialects, so nothing is
 * rebuilt and no existing row changes. It is an off-chain annotation column — it does **not** enter
 * the audit hash payload, so existing chain verification is unaffected.
 *
 * **No backfill.** A historical row's claim cannot be proven from the stored facts (the only precise
 * key shared by the two sides is the idempotency key, and a row without it cannot be paired without
 * guessing by tool name plus time). Such rows stay `NULL` and readers report them as `unlinked`.
 *
 * Timestamp 1845000000000 is later than the newest existing migration 1844000000000.
 *
 * AW-11：审计行到它那条占位行的**正向边**。
 *
 * `ai_write_claims.audit_row_id` 指的是占位 → 审计。那是证据根归因需要的方向，但它让**最权威的行类型**
 * 无路可走：从审计行出发的读者完全到不了确认行与副作用行。本列是另一个方向（审计 → 占位），
 * 使两个方向都走得通。
 *
 * 可空、增量、可回滚：双方言均为普通 `ALTER TABLE ADD COLUMN`，故不重建表、不改既有行。它是链外注解列 ——
 * **不**进入审计 hash payload，故既有链校验不受影响。
 *
 * **不回填。** 历史行的占位关系无法从已存事实证明（两侧唯一精确的共同键是幂等键，而没有那条键的行
 * 只能按工具名加时间去猜）。这些行保持 `NULL`，读侧如实报 `unlinked`。
 *
 * 时间戳 1845000000000 晚于最新既有迁移 1844000000000。
 */
export class AddAuditWriteClaimLink1845000000000 implements MigrationInterface {
  name = 'AddAuditWriteClaimLink1845000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "write_claim_id" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "write_claim_id"`);
  }
}
