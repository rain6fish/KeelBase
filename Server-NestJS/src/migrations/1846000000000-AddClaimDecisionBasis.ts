// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AW-15: the claim row learns the basis of its own decision — which role and which policy revision.
 *
 * `authorization_ref` names the authorization and `claimed_at` names the moment, but after a role is
 * revoked neither can answer "which grant let this through". These two columns freeze that reading at
 * decision time: `decided_role` from the user row, `policy_revision` from the same policy content
 * fingerprint the authorization snapshot records.
 *
 * Nullable, additive, reversible: a plain `ALTER TABLE ADD COLUMN` on both dialects, so nothing is
 * rebuilt and no existing row changes. These are off-chain annotation columns on a table that is in no
 * hash chain, so chain verification is unaffected.
 *
 * **No backfill.** A row written before these columns has neither fact and neither can be
 * reconstructed. Such rows stay `NULL` and readers report them as `unknown` — never as "no role" or
 * "no policy", and never as a guessed value.
 *
 * AW-15：占位行记下自己这次判定的依据 —— 哪个角色、哪一版策略。
 *
 * `authorization_ref` 指明授权，`claimed_at` 指明时刻，但角色被撤销之后，两者都答不了
 * 「当时依据哪一份授予放行」。本两列把那一刻的读数冻结下来：`decided_role` 来自用户行，
 * `policy_revision` 来自授权快照记录的同一个策略内容指纹。
 *
 * 可空、增量、可回滚：双方言均为普通 `ALTER TABLE ADD COLUMN`，故不重建表、不改既有行。它们是一张
 * 不入任何哈希链的表上的链外注解列，故链校验不受影响。
 *
 * **不回填。** 本列之前的行两个事实都没有、也无法重建。这些行保持 `NULL`，读侧报 `unknown` ——
 * 不报成「没有角色」或「没有策略」，也不填任何猜测值。
 */
export class AddClaimDecisionBasis1846000000000 implements MigrationInterface {
  name = 'AddClaimDecisionBasis1846000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const varchar = queryRunner.connection.options.type === 'postgres' ? 'character varying' : 'varchar';
    await queryRunner.query(`ALTER TABLE "ai_write_claims" ADD "decided_role" ${varchar}(32)`);
    await queryRunner.query(`ALTER TABLE "ai_write_claims" ADD "policy_revision" ${varchar}(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_write_claims" DROP COLUMN "policy_revision"`);
    await queryRunner.query(`ALTER TABLE "ai_write_claims" DROP COLUMN "decided_role"`);
  }
}
