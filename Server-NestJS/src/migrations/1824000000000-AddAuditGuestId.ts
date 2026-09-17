// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AU-3（§22.19 归因层）：两审计表加 guest_id（varchar(64) 可空）——访客标识。
 *
 * 解决的问题：演示端访客共享同一账号（alex）→ 审计 `user_id` 全塌缩成一个，N 个访客不可区分。
 * `guest_id` 是**与账号无关**的匿名标识（由 main.ts 全局中间件签发/读取 cookie），
 * 使「N 个访客 → 审计可见 N 个不同来源」成立，而**不把访客身份并入真人账号**（§22.19 护栏①）。
 *
 * 链外列：**不入 hash payload**（护栏③「只补归因维度、新列不进链 payload」）——故不破既有链、
 * 不改既有行、不需要重签。postgres / sqlite 均简单 ALTER ADD COLUMN（同 AddAiAuditIp 先例）。
 */
export class AddAuditGuestId1824000000000 implements MigrationInterface {
  name = 'AddAuditGuestId1824000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "operation_audit_logs" ADD "guest_id" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "guest_id" varchar(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "guest_id"`);
    await queryRunner.query(`ALTER TABLE "operation_audit_logs" DROP COLUMN "guest_id"`);
  }
}
