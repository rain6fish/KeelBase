// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-19 ②: `ai_audit_logs` gains `tool_args` — the call's arguments as a machine-shaped column,
 * nullable, off-chain (not part of the hash payload, same stance as `outcome` / `tool`).
 *
 * The arguments were only ever spelled inside `detail` as `tool({...})` prose, truncated at 500
 * characters on the MCP door and 2000 on the audit row. Reading them back meant parsing that prose,
 * which is exactly the work C-3 exists to remove — so "what was done" was answerable only on the
 * paths that happen to leave a confirmation row or a side-effect row behind, and unanswerable on
 * refused and read calls. Measured on 2026-10-28: `what` was the one question missing on five of the
 * seven event classes.
 *
 * Off-chain because adding the column to the payload would change the recomputed payload of every
 * historical v2 row and break the chain's verification — the same reason `outcome` / `tool` / `ip`
 * stayed out (§22.19 guardrail ③). A plain ALTER ADD COLUMN on both dialects.
 *
 * P0-19 ②：`ai_audit_logs` 加 `tool_args` —— 调用的参数作为一列机器可读值，可空，链外
 * （不进 hash payload，与 `outcome` / `tool` 同一立场）。
 *
 * 参数此前只拼在 `detail` 的 `tool({...})` 散文里（MCP 那扇门截到 500 字符、审计行截到 2000）。
 * 要读回来就得解析那段散文 —— 正是 C-3 要消掉的那件事 —— 于是「做了什么」只有恰好留下确认行或
 * 副作用行的路径答得出，被拒与读调用答不出。2026-10-28 实测：七类里有五类的 `what` 是缺的。
 *
 * 链外：这一列若进 payload，会让**每一条历史 v2 行**的重算 payload 变化、链验证当场失败 —— 与
 * `outcome` / `tool` / `ip` 留在链外是同一个理由（§22.19 护栏③）。两种方言上都是普通 ALTER ADD COLUMN。
 */
export class AddAiAuditToolArgs1845000000000 implements MigrationInterface {
  name = 'AddAiAuditToolArgs1845000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "tool_args" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "tool_args"`);
  }
}
