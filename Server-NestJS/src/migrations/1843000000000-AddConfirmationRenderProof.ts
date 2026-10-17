// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CONF-3 (2026-10-17): `ai_confirmation_requests` gains the **render proof** columns.
 *
 * The row already bound what would be written (tool name + exact args) but never what the approver
 * was shown. The summary is a deterministic function of tool name + args and both clients render the
 * raw args too, so recomputing after the fact yields *today's* rendering — a changed mapping or a
 * changed translation silently rewrites the apparent history. `render_hash` is a SHA-256 over the
 * canonical payload emitted at issue time (tool name + presentation text + arguments) and
 * `render_version` names the renderer generation that produced it.
 *
 * Both are **chain-external annotation columns** like `audience` / `expires_at`: this table is in no
 * hash chain, so existing chains and rows are untouched and no re-signing is needed. Historical rows
 * stay `null` — their rendering generation is unknown, and recomputing would assert something we
 * cannot know.
 *
 * postgres / sqlite both use a simple `ALTER ADD COLUMN` (no index, so sqlite needs no table rebuild,
 * following AddConfirmationExecutionState). Timestamp 1843000000000 is later than the newest existing
 * migration 1842000000000.
 *
 * CONF-3（2026-10-17）：`ai_confirmation_requests` 加**渲染凭据**两列。
 *
 * 该行早已绑住会写什么（工具名 + 精确参数），却从未绑住批准人**看到过什么**。摘要本就是（工具名，
 * 参数）的确定性函数，且两个客户端还渲染原始参数，故事后重算得到的是**今天**的渲染 —— 改一处映射或
 * 一条翻译，就会静默改写表面的历史。`render_hash` 是签发时实际下发载荷（工具名 + 呈现文案 + 参数）
 * 规范形式的 SHA-256，`render_version` 点名产生它的渲染代次。
 *
 * 两列均是**链外注解列**，与 `audience` / `expires_at` 同类：本表不在任何哈希链里，故既有链与既有行
 * 不受影响、不需重签。历史行留 `null` —— 其渲染代次不可考，重算等于断言一件我们不知道的事。
 *
 * postgres / sqlite 均**简单 ALTER ADD COLUMN**（不建索引，故不必走 sqlite 的整表重建，同
 * AddConfirmationExecutionState 先例）。时间戳 1843000000000 晚于最新既有迁移 1842000000000。
 */
export class AddConfirmationRenderProof1843000000000 implements MigrationInterface {
  name = 'AddConfirmationRenderProof1843000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const varchar = queryRunner.connection.options.type === 'postgres' ? 'character varying' : 'varchar';
    await queryRunner.query(
      `ALTER TABLE "ai_confirmation_requests" ADD "render_hash" ${varchar}(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_confirmation_requests" ADD "render_version" ${varchar}(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_confirmation_requests" DROP COLUMN "render_version"`);
    await queryRunner.query(`ALTER TABLE "ai_confirmation_requests" DROP COLUMN "render_hash"`);
  }
}
