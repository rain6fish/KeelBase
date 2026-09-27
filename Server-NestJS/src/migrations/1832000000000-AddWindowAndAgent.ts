// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REV-7: record the authorization window, and put the agent identity beside the side effect.
 *
 * Two facts that existed but could not be read back from the record they belong to:
 *
 * 1. `ai_confirmation_requests.expires_at` — the window was derived on read as
 *    `createdAt + the current offline TTL`, and that TTL is a mutable setting. Changing the setting
 *    therefore moved the window of every row already on the books, so "was this still inside its
 *    window at the time" had no stable answer. Recording it makes the window a property of that
 *    authorization rather than a function of today's configuration.
 * 2. `ai_tool_side_effects.agent_id` — who was acting for the user. The audit row already carried it,
 *    one structure away and with no direct key between them, so the pairing was by approximation
 *    (conversation / run / tool). Beside the side effect, the row answers for itself.
 *
 * Both are **chain-external annotation columns** — not in any chain payload — so existing chains verify
 * unchanged and nothing needs re-signing. **No backfill**: a pre-column row's window is unknowable
 * (the setting may have changed since) and its agent may have been none or unknown, so the columns stay
 * `null` rather than being filled with a guess.
 *
 * Plain `ALTER TABLE ADD COLUMN` on both dialects (no index, so no sqlite table rebuild). Timestamp
 * 1832000000000 is later than the newest existing migration 1831000000000.
 *
 * REV-7：把授权窗口记下来，并把 agent 身份放到副作用行旁边。
 *
 * 两件**事实存在、却读不回它所属那条记录**的事：
 *
 * 1. `ai_confirmation_requests.expires_at` —— 窗口此前是**读时**算的（`createdAt + 当前的离线 TTL`），
 *    而 TTL 是可变的配置。于是改配置会把**账上每一行**的窗口挪走，「当时是否仍在窗口内」便没有稳定答案。
 *    记下来，窗口才是那次授权的属性，而不是今天配置的函数。
 * 2. `ai_tool_side_effects.agent_id` —— 谁在替用户执行。审计行本来就有，但住在另一个结构里、两者无直接
 *    外键，于是配对只能靠 conversation / run / tool **近似**。放在副作用行旁边，该行自己就能回答。
 *
 * 两列均为**链外注解列**（不入任何链 payload），故既有链验签不受影响、不需重签。**不回填**：引入本列
 * 之前的行，窗口**不可考**（配置可能已变）、agent 可能没有也可能未知，故留 `null` 而不拿猜测去填。
 *
 * 双方言均为普通 `ALTER TABLE ADD COLUMN`（不建索引，故无 sqlite 整表重建）。时间戳 1832000000000
 * 晚于最新既有迁移 1831000000000。
 */
export class AddWindowAndAgent1832000000000 implements MigrationInterface {
  name = 'AddWindowAndAgent1832000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const varchar = isPostgres ? 'character varying' : 'varchar';
    const datetime = isPostgres ? 'timestamp' : 'datetime';
    await queryRunner.query(
      `ALTER TABLE "ai_confirmation_requests" ADD "expires_at" ${datetime}`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" ADD "agent_id" ${varchar}(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "agent_id"`);
    await queryRunner.query(`ALTER TABLE "ai_confirmation_requests" DROP COLUMN "expires_at"`);
  }
}
