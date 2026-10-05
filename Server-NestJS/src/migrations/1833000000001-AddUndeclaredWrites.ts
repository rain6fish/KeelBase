// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REV-10: writes the call actually made that the ledger has no row for, recorded on the row it does have.
 *
 * Registration has always recorded what the tool **declared**. Nothing observed what actually landed in
 * the tables, so "declares one row, writes ten" could only surface later — at revoke time, or on a
 * conflict replay — and the undeclared rows are unreachable by revoke by construction. With a
 * data-layer sensor in place, the writes the ledger has no row for become a fact on the row it does.
 *
 * **A finding, not a verdict.** The column changes nothing: no declaration is rewritten, no
 * compensation is triggered, no revoke conclusion moves. `null` means no such write was observed — the
 * ordinary case — or that the row predates this column; the two are not distinguished and neither is
 * filled in with a guess.
 *
 * **Chain-external annotation column** (not in `_chainPayload`), so existing chains verify unchanged.
 * Plain `ALTER TABLE ADD COLUMN` on both dialects. Timestamp 1833000000000 is later than the newest
 * existing migration 1832000000000.
 *
 * REV-10：本次调用真的写了、而账本上没有对应行的那些写，记在账本**有**的那一行上。
 *
 * 登记层历来只记工具**声明**的东西。没有任何地方观察真正落进表里的是什么，故「声明一行、写十行」只能
 * 事后才浮现——撤销时、或冲突回放时——而那些没被声明的行**按构造就撤不到**。有了数据层传感器之后，
 * 账本没有对应行的写，就成为账本**有**的那一行上的一个事实。
 *
 * **这是发现，不是裁决。** 本列什么都不改：不重写声明、不触发补偿、不动任何撤销结论。`null` 表示没
 * 观察到这类写（寻常情形），或该行早于本列出现；两者不区分，也都不拿猜测去填。
 *
 * **链外注解列**（不入 `_chainPayload`），故既有链验签不受影响。双方言均为普通 `ALTER TABLE ADD COLUMN`。
 * 时间戳 1833000000001 晚于最新既有迁移 1832000000000；与同批的 `AddFollowupPlanCustomerId`
 * （1833000000000，改 `followup_plans`）**同刻**，两条各吃一张不同的表、彼此无顺序依赖 —— 这里 +1 是为了
 * 让链的顺序**确定**，不靠文件系统的枚举顺序。
 */
export class AddUndeclaredWrites1833000000001 implements MigrationInterface {
  name = 'AddUndeclaredWrites1833000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" ADD "undeclared_writes" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "undeclared_writes"`);
  }
}
