// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C-3: `ai_audit_logs` gains `outcome` (a frozen result code) and `tool` (the tool the row is about),
 * both nullable. The evaluation surface reads `detail` free text today and takes the tool name from
 * its first token — a parse that only works on one of the two implementations, because their `detail`
 * grammars differ (`<tool> <verb> …` here, `<tool>(<argsJson>)` in the Node runtime). These two
 * columns replace that parse with a lookup.
 *
 * Off-chain columns: **not part of the hash payload** (§22.19 guardrail ③ — attribute dimensions
 * only, never the chain payload), so they collide with nothing and rewrite no existing row. Both are
 * a plain ALTER ADD COLUMN on postgres and sqlite (the AddAiAuditIp / AddAiAuditDeviceId precedent).
 *
 * C-3：`ai_audit_logs` 加 `outcome`（冻结结果码）与 `tool`（本行所属的工具），两列均可空。评估面今天读
 * `detail` 自由文本、并拿它的第一个 token 当工具名 —— 而那个解析只在两个实现中的一个上成立（两者的
 * `detail` 文法不同：这边是 `<tool> <动词> …`、Node 运行时是 `<tool>(<argsJson>)`）。这两列把那一次解析
 * 换成一次查表。
 *
 * 链外列：**不入 hash payload**（§22.19 护栏③「只补归因维度、新列不进链 payload」）—— 故与链不冲突、
 * 不改既有行。两列在 postgres 与 sqlite 上都是简单的 ALTER ADD COLUMN（AddAiAuditIp / AddAiAuditDeviceId 先例）。
 */
export class AddAiAuditOutcomeAndTool1838000000000 implements MigrationInterface {
  name = 'AddAiAuditOutcomeAndTool1838000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "outcome" varchar(32)`);
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "tool" varchar(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "tool"`);
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "outcome"`);
  }
}
