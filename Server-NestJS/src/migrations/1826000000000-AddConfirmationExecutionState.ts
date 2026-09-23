// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P2（审批执行态，2026-09-23）：`ai_confirmation_requests` 加**执行轴**三列。
 *
 * 解决的问题：决策轴（`status`：pending → approved|declined|timeout）早已由条件更新保证「至多一次裁决」，
 * 但**执行轴**（这次批准的写到底跑没跑成）没有任何记录 —— 于是 R4 审批在执行阶段中断（进程被杀 /
 * 容器重启 / 外部超时后崩溃）时会留下「已批准但从未执行」的行，而重试只得到 `already decided`：
 * **既看不见，也重试不了**。
 *
 * 三列（均**链外注解列**，不入任何哈希链 payload，故不破既有链、不改既有行、不需重签）：
 * - `execution_claimed_at`：一次执行尝试的开始时刻 = **租约**戳。它让「重试认领」成为原子的
 *   （条件更新写入本列，谓词排除租约未过期的行），也让崩溃可恢复（租约过期即可重新认领）。
 * - `executed_at`：执行成功时刻。
 * - `execution_error`：最近一次失败原因。**崩溃/挂起时不写**（我们并不知道结果）——
 *   此时 `execution_claimed_at` 有值而本列为空，对外即 `executionState=failed` 且无原因可报。
 *
 * **不动状态集**：不往 `status` 里塞 `executing` 之类的值，故冻结语料 `confirmation-lifecycle` 与
 * 三端状态渲染面都不受影响（决策与执行是两条正交的轴，见 wire `governance-confirmation-item` v2）。
 *
 * postgres / sqlite 均**简单 ALTER ADD COLUMN**（本迁移不建索引，故不必走 sqlite 的整表重建，同 AddAuditGuestId 先例）。
 * 时间戳 1826000000000 晚于最新既有迁移 1825000000000。
 */
export class AddConfirmationExecutionState1826000000000 implements MigrationInterface {
  name = 'AddConfirmationExecutionState1826000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tsType = queryRunner.connection.options.type === 'postgres' ? 'timestamp' : 'datetime';
    await queryRunner.query(
      `ALTER TABLE "ai_confirmation_requests" ADD "execution_claimed_at" ${tsType}`,
    );
    await queryRunner.query(`ALTER TABLE "ai_confirmation_requests" ADD "executed_at" ${tsType}`);
    await queryRunner.query(`ALTER TABLE "ai_confirmation_requests" ADD "execution_error" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_confirmation_requests" DROP COLUMN "execution_error"`);
    await queryRunner.query(`ALTER TABLE "ai_confirmation_requests" DROP COLUMN "executed_at"`);
    await queryRunner.query(
      `ALTER TABLE "ai_confirmation_requests" DROP COLUMN "execution_claimed_at"`,
    );
  }
}
