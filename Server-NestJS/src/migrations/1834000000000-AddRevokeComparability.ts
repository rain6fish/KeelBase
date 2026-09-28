// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REV-14: **the members a revoke promised to compare, and the ones it could not** — recorded on the row,
 * so the difference survives the verdict that says `complete`.
 *
 * REV-9 already asks, before the local soft delete, whether the target is still the record the AI wrote.
 * When it cannot answer — the target row is gone, the read threw — it reports nothing, because guessing
 * would be worse than silence. That silence has a cost this column pays off: the member *was* declared
 * comparable, the revoke *did* read the target, and the verdict still reads complete, so nothing anywhere
 * says that part of the check never happened.
 *
 * The column holds `{ promised: [...], uncomparable: [{ resultType, resultId, reason }] }` for the latest
 * comparison pass. It is written on the group's **root** row, one copy only — the group is the unit a
 * revoke concludes about, so one evidence row is where that conclusion's blind spots belong.
 *
 * **A finding, not a verdict**: no refusal, no verdict change, no compensation, and no contract change.
 * A pass with no such difference **clears** the column rather than storing an empty one, so the reading
 * is never present for a state that no longer holds. **No backfill**: rows revoked before this column
 * existed did not record the difference and it cannot be reconstructed, so they stay `null`.
 *
 * **Chain-external annotation column** (not in `_chainPayload`), so existing chains verify unchanged.
 * Plain `ALTER TABLE ADD COLUMN` on both dialects. Timestamp 1834000000000 is later than the newest
 * existing migration 1833000000000.
 *
 * REV-14：**本次撤销承诺比对、而实际没能比到的那些成员** —— 记在行上，故该差集能活过那句 `complete`。
 *
 * REV-9 已经在本地软删之前问过「目标还是不是我写的那条」。答不出来时（目标行没了、读取抛错）它什么都
 * 不报，因为猜测比沉默更糟。而这份沉默有一份代价，正是本列要偿付的：那个成员**确实**被声明为可比、
 * 撤销**确实**读了目标，判定却仍读作完成 —— 于是没有任何地方说出「这部分检查根本没做」。
 *
 * 本列承载最近一次比对的结果 `{ promised: [...], uncomparable: [{ resultType, resultId, reason }] }`，
 * 写在组内**根行**上、只此一份 —— 组才是撤销下结论的单位，故该结论的盲区也归这一行。
 *
 * **这是发现，不是裁决**：不拒绝、不改判定、不触发补偿、不动契约。没有差集的那一次**清空**本列，
 * 而不是写一个空壳，故读数绝不会停留在一个已经不再成立的状态上。**不回填**：引入本列之前撤销的行
 * 没有记下这个差集，也无法重建，故留 `null`。
 *
 * **链外注解列**（不入 `_chainPayload`），故既有链验签不受影响。双方言均为普通 `ALTER TABLE ADD COLUMN`。
 * 时间戳 1834000000000 晚于最新既有迁移 1833000000000。
 */
export class AddRevokeComparability1834000000000 implements MigrationInterface {
  name = 'AddRevokeComparability1834000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" ADD "revoke_comparability" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "revoke_comparability"`);
  }
}
