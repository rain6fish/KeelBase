// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AW-20: an operation identity, and a place to record that a new write may duplicate an earlier one.
 *
 * The ledger already had a **per-conversation** idempotency key. It could not see that the same
 * external effect had been launched from a second conversation, because the conversation is part of
 * that key. Two changes close that gap:
 *
 * 1. `ai_write_claims.operation_key` — `sha256(userId:toolName:canonicalArgs)`, no conversation. A
 *    **partial unique index over `claimed` rows** makes it an arbitration point: at most one in-flight
 *    claim per operation. It deliberately does **not** bind settled rows — the same parameters can be a
 *    second, legitimate operation, and that must remain possible. The index therefore never turns
 *    "same parameters" into "same operation forever"; it only stops a second *concurrent* send.
 * 2. `ai_tool_side_effects.possible_duplicate` — JSON evidence `{of, reason}` for a new row that landed
 *    where the ledger already holds an effect. A finding, not a verdict: nothing is refused, rewritten
 *    or compensated because of it.
 *
 * Additive and reversible on both dialects. `operation_key` is nullable, so rows written before this
 * migration take no part in the lease (they are not reconstructed — the original arguments cannot be
 * rebuilt from the stored columns). Both tables are outside the audit hash chain, and both new columns
 * are additionally outside `_chainPayload`, so chain verification is unaffected.
 *
 * Index name: this is a partial index, so TypeORM's `<table>_<column>` hash naming does not apply to
 * it; the explicit name is the same one the entity declares, which keeps `synchronize` and this
 * migration in agreement.
 *
 * AW-20：操作身份，以及一个记录「这次新写可能是对更早一次效果的重复」的位置。
 *
 * 账上原本只有**按会话**划分的幂等键。它看不见同一外部效果从第二个会话发起过，因为会话就在那个键里。
 * 两处改动补上这个缺口：
 *
 * 1. `ai_write_claims.operation_key` —— `sha256(userId:toolName:canonicalArgs)`，不含会话。一个**只覆盖
 *    `claimed` 行的部分唯一索引**把它变成仲裁点：同一操作同时最多一条在途占位。它**有意不约束**
 *    `settled` 行 —— 相同参数完全可能是第二次合法操作，那必须仍然可行。故该索引不会把「同参数」永久
 *    等同于「同一操作」；它只拦住第二次**并发**发送。
 * 2. `ai_tool_side_effects.possible_duplicate` —— 新行落在账上已有同一效果之处时的 JSON 证据
 *    `{of, reason}`。是发现，不是判决：不因此拒绝、不改写、不触发补偿。
 *
 * 双方言均为增量、可回滚。`operation_key` 可空，故本迁移之前的行不参与租约（不回填 —— 原始参数无法从
 * 已落库的列重建）。两张表都在审计哈希链之外，两个新列另在 `_chainPayload` 之外，故链校验不受影响。
 *
 * 索引名：这是部分索引，TypeORM 的 `<表>_<列>` 哈希命名不适用于它；此处显式名与实体声明的一致，
 * 使 `synchronize` 与本迁移彼此吻合。
 */
export class AddOperationIdentity1849000000000 implements MigrationInterface {
  name = 'AddOperationIdentity1849000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const varchar =
      queryRunner.connection.options.type === 'postgres' ? 'character varying' : 'varchar';
    await queryRunner.query(`ALTER TABLE "ai_write_claims" ADD "operation_key" ${varchar}(64)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ai_write_claims_operation_lease" ON "ai_write_claims" ("operation_key") ` +
        `WHERE "status" = 'claimed' AND "operation_key" IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" ADD "possible_duplicate" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "possible_duplicate"`);
    await queryRunner.query(`DROP INDEX "IDX_ai_write_claims_operation_lease"`);
    await queryRunner.query(`ALTER TABLE "ai_write_claims" DROP COLUMN "operation_key"`);
  }
}
