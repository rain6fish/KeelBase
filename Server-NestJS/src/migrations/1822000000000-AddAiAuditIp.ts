// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AU-2（§22.19 归因层）：ai_audit_logs 加 ip（varchar(45) 可空）——客户端来源 IP（真实 IP 由 trust proxy / AU-1 解析）。
 *
 * 链外列：**不入 hash payload**（§22.19 护栏③「只补归因维度、新列不进链 payload」）——故不与链冲突、不改既有行。
 * postgres / sqlite 均简单 ALTER ADD COLUMN（同 AddAiAuditPayloadVersion 先例）。
 */
export class AddAiAuditIp1822000000000 implements MigrationInterface {
  name = 'AddAiAuditIp1822000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "ip" varchar(45)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "ip"`);
  }
}
