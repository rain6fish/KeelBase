// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REV-2（撤销契约如实性，2026-09-24）：`ai_tool_side_effects` 加**补偿请求时刻**。
 *
 * 解决的问题：`revoke_status='compensating'` 表示「已请求外部补偿、结果未知」，但这一状态**没有年龄**——
 * 实体只有 `created_at`（副作用发生时刻）与分类用的 `revoke_status`，没有任何「补偿请求是什么时候发出的」
 * 记录。于是聚合视图里的「当前未了结」对**上个月卡住的行**与**五分钟前刚请求的行**给出完全相同的读数：
 * 逐行诚实，聚合不诚实。本列让「哪些 `compensating` 超过 N 分钟未了结」成为可查询的事实。
 *
 * - `revoke_requested_at`：进入 `compensating` 时写入（重试则更新为最近一次请求）。
 *   **链外注解列**，不入任何哈希链 payload —— 故不破既有链、不改既有行、不需重签。
 * - **只记录时长**：真值仍在目标系统；本列**不**用于把状态改写成成功或失败。
 *
 * postgres / sqlite 均**简单 ALTER ADD COLUMN**（本迁移不建索引，故不必走 sqlite 的整表重建，同
 * AddConfirmationExecutionState / AddAuditGuestId 先例）。时间戳 1827000000000 晚于最新既有迁移 1826000000000。
 */
export class AddRevokeRequestedAt1827000000000 implements MigrationInterface {
  name = 'AddRevokeRequestedAt1827000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tsType = queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'datetime';
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" ADD "revoke_requested_at" ${tsType}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" DROP COLUMN "revoke_requested_at"`,
    );
  }
}
