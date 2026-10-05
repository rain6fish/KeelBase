// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REV-11: who took a stuck compensation on, and when — two annotation columns on the side-effect row.
 *
 * The stale reading could already say whether a row was stuck, how (`unacknowledged` — possibly never
 * arrived — versus `awaiting_target` — arrived with no answer), how long, and on whose behalf the
 * write happened. It could not say that anyone had picked it up. Having somewhere to look is not the
 * same as someone having to look, and the second one needs a row rather than an inference: `user_id`
 * names the **accountable party**, not the **taker**.
 *
 * **Nothing else moves.** Claiming does not rewrite `revoke_status`, does not touch the target, and
 * does not claim the compensation finished — the truth still lives in the target system. A claim is a
 * statement about who is looking, never about what happened out there. This is also why "needs
 * claiming" is **derived** (`stale AND claimed_by IS NULL`) rather than stored: two copies of one
 * fact can disagree, one cannot.
 *
 * **Chain-external annotation columns** (not in `_chainPayload`), so existing chains verify unchanged
 * and no re-signing is needed. Plain `ALTER TABLE ADD COLUMN` on both dialects (no index, so no
 * sqlite table rebuild). Timestamp 1831000000000 is later than the newest existing migration
 * 1830000000000.
 *
 * REV-11：谁把卡住的补偿接了过去、何时 —— 副作用行上两列注解。
 *
 * 陈旧读数此前已能说清一条行卡没卡、怎么卡（`unacknowledged` 可能根本没到达 vs `awaiting_target`
 * 到达了没回音）、卡了多久、那次写代表谁，却说不出**有没人接手**。「有的看」不等于「必须有人看」，
 * 而后者要的是一行记录而非推断：`user_id` 说的是**责任人**，不是**接手人**。
 *
 * **别的什么都不动。** 认领不改写 `revoke_status`、不碰目标、不声称补偿已完成 —— 真值仍在目标系统。
 * 认领陈述的是「谁在看」，从不是「外面发生了什么」。这也正是「需认领」**派生**（`stale AND
 * claimed_by IS NULL`）而不落库的原因：同一事实的两份拷贝会互相矛盾，一份不会。
 *
 * **链外注解列**（不入 `_chainPayload`），故既有链验签不受影响、不需重签。双方言均为普通
 * `ALTER TABLE ADD COLUMN`（不建索引，故无 sqlite 整表重建）。时间戳 1831000000001 晚于最新既有迁移
 * 1830000000000；与同批的 `AddReports`（1831000000000，建 `reports` 表）**同刻**，两条各吃一张不同的表、
 * 彼此无顺序依赖 —— 这里 +1 是为了让链的顺序**确定**，不靠文件系统的枚举顺序。
 */
export class AddRevokeClaim1831000000001 implements MigrationInterface {
  name = 'AddRevokeClaim1831000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const varchar = isPostgres ? 'character varying' : 'varchar';
    const datetime = isPostgres ? 'timestamp' : 'datetime';
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" ADD "revoke_claimed_by" ${varchar}(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" ADD "revoke_claimed_at" ${datetime}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "revoke_claimed_at"`);
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "revoke_claimed_by"`);
  }
}
