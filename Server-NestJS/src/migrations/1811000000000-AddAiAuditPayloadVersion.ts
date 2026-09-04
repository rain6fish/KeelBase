// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * G-2（§22.17 ① G-2，HS-11 全字段入链 add-only）：ai_audit_logs 加 payload_version（smallint/int 可空）。
 * 新行 payloadVersion=2 → 链 payload 含链外归责/业务注解列真实值（DB 篡改即破链）；历史行 null → v1 恒空，既有链不破。
 * postgres / sqlite 均简单 ALTER ADD COLUMN。
 */
export class AddAiAuditPayloadVersion1811000000000 implements MigrationInterface {
  name = 'AddAiAuditPayloadVersion1811000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "payload_version" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "payload_version"`);
  }
}
