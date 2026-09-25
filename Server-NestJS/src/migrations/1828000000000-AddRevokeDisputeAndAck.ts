// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REV-1 + REV-2 细化（撤销契约如实性，2026-09-24）：`ai_tool_side_effects` 加两列。
 *
 * - `revoke_dispute`（text）：**声明与持有不一致**的证据（JSON）。同参数重试命中幂等键 → 整组回滚 → 回放既有组，
 *   若重试声明的成员与已持有的**不同**（多声明或少声明），差异此前被静默吞掉 —— 撤销该组只补偿持有的那些行、
 *   汇总却报全绿。本列留存被拒的那份声明与双向差集，整组据此被标为争议，撤销路径**拒绝报告完成**。
 * - `revoke_acknowledged_at`（timestamp）：**外呼确认时刻**，补偿端点返回**之后**写（`revoke_requested_at` 是发出
 *   **之前**写的意图）。两列合起来把「可能根本没到达」与「确实到达了但没有回音」分成两种可查的不确定，
 *   而不再折进同一个 `compensating` 取值。
 *
 * 两列都是**链外注解列**：不入任何哈希链 payload —— 故不破既有链、不改既有行、不需重签。
 * 纯运维态注解，**不**用于把状态改写成成功或失败（真值仍在目标系统）。
 *
 * postgres / sqlite 均**简单 ALTER ADD COLUMN**（本迁移不建索引，故不必走 sqlite 的整表重建，同
 * AddRevokeRequestedAt 先例）。时间戳 1828000000000 晚于最新既有迁移 1827000000000。
 */
export class AddRevokeDisputeAndAck1828000000000 implements MigrationInterface {
  name = 'AddRevokeDisputeAndAck1828000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tsType = queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'datetime';
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" ADD "revoke_dispute" text`);
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" ADD "revoke_acknowledged_at" ${tsType}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_tool_side_effects" DROP COLUMN "revoke_acknowledged_at"`,
    );
    await queryRunner.query(`ALTER TABLE "ai_tool_side_effects" DROP COLUMN "revoke_dispute"`);
  }
}
