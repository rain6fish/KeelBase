// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-19 ⑧ (2026-11-06): `ai_confirmation_requests` gains the **issue-time allow basis**.
 *
 * The basis was only ever written to `ai_audit_logs`, and only *after* the in-stream wait resolved.
 * A process that dies inside that wait therefore loses it for good, while the confirmation row — the
 * one thing persisted before the wait — keeps saying "a person was asked". Parking the same snapshot
 * on that row is what lets a reader answer "why was this allowed to reach a person" for a call that
 * never got its turn back. It is deliberately **not** recomputed at expiry: that would answer with
 * today's policy. Rows minted before this column stay `null`.
 *
 * Generated from the entity diff (`migration:generate -t 1848000000000`), then narrowed to a plain
 * `ALTER ADD COLUMN`: a nullable text column needs no sqlite table rebuild, and the generator's
 * rebuild form drops and re-creates the `(status, created_at)` index on a table the sweep queries
 * every hour. Same shape as `AddConfirmationRenderProof` (same table) and `AddAiAuditToolArgs` (same
 * column shape); the statement is valid on both dialects.
 *
 * Timestamp 1848000000000 is later than every existing migration, including the ones that rebuild
 * this table (newest touching it: 1843000000000).
 *
 * P0-19 ⑧（2026-11-06）：`ai_confirmation_requests` 加**签发时点的放行依据**。
 *
 * 依据此前只写进 `ai_audit_logs`，且是在对话内等待解决**之后**才写。死在等待里的进程因此把它永久丢掉，
 * 而确认行 —— 唯一在等待之前就落库的东西 —— 仍然写着「问过一个人」。把同一份快照停在这一行上，才能让
 * 读者对「这一轮再也拿不回来」的调用答出「凭什么允许它走到人面前」。到期时**不**重算（那会答出今天的
 * 策略）。本列之前的行留 `null`。
 *
 * 由实体差分生成（`migration:generate -t 1848000000000`），随后收窄为普通 `ALTER ADD COLUMN`：
 * 可空 text 列不需要 sqlite 整表重建，而生成器的重建形式会丢掉再重建 `(status, created_at)` 索引 ——
 * 那是每小时清扫都要查的表。与 `AddConfirmationRenderProof`（同一张表）、`AddAiAuditToolArgs`
 * （同一列形状）同形；该语句在两种方言上都成立。
 *
 * 时间戳 1848000000000 晚于所有既有迁移，包括那些重建本表的（触碰本表的最新一个是 1843000000000）。
 */
export class AddConfirmationAuthorization1848000000000 implements MigrationInterface {
  name = 'AddConfirmationAuthorization1848000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_confirmation_requests" ADD "authorization" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_confirmation_requests" DROP COLUMN "authorization"`);
  }
}
