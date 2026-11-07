// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AW-16 F-64: the claim row learns where it sits in the governance workflow.
 *
 * `status` is the execution ledger's fact and stays untouched by expiry: a stale hold is still
 * `claimed`, because nothing has established whether the write landed. This new column records the
 * **handling**: `open` (inside the window), `awaiting_decision` (the window expired; the hold is in
 * the pending-decision queue), `closed_unknown` (a human released the hold; the conclusion is still
 * unknown and the key remains occupied so the same call is not silently retried).
 *
 * Additive and reversible: one `ALTER TABLE ADD COLUMN` on both dialects. Existing rows get `open`
 * — a statement about the new field's initial value, not a claim about their past. The hourly sweep
 * moves genuinely overdue rows into the queue on its next pass.
 *
 * **No conclusion is written here.** The column cannot express "released" or "not executed"; both of
 * those already mean specific, evidenced things on `status`, and expiry has no such evidence.
 *
 * AW-16 F-64：占位行记下自己在治理流程里的位置。
 *
 * `status` 是执行账本的事实，过期不碰它：滞留占位仍是 `claimed`，因为没有任何东西证明这次写是否落库。
 * 新列记录的是**处置**：`open`（窗口内）、`awaiting_decision`（窗口到期，进入待裁队列）、
 * `closed_unknown`（人已释放滞留，结论仍未知，键仍被占住，故同一次调用不会被静默重试）。
 *
 * 增量、可回滚：双方言均为一次 `ALTER TABLE ADD COLUMN`。既有行取 `open` —— 说的是新字段的初始值，
 * 不是对它们过去的断言。每小时清扫会在下一轮把真正到期的行移入队列。
 *
 * **这里不写任何结论。** 本列表达不了「已释放」或「未执行」—— 那两个词在 `status` 上已有确切、
 * 有证据的含义，而过期没有那种证据。
 */
export class AddClaimDecisionState1848000000000 implements MigrationInterface {
  name = 'AddClaimDecisionState1848000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const varchar = queryRunner.connection.options.type === 'postgres' ? 'character varying' : 'varchar';
    await queryRunner.query(
      `ALTER TABLE "ai_write_claims" ADD "decision_state" ${varchar}(32) NOT NULL DEFAULT 'open'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_write_claims" DROP COLUMN "decision_state"`);
  }
}
