// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * G-1（§22.17 ① G-1，docs/roadmap 私库 backlog）：operation_audit_logs 加 authorization（事件时点授权依据快照 JSON）。
 * 列可空，postgres / sqlite 均简单 ALTER ADD COLUMN。
 * authorization 不入审计哈希链（链外注解，对齐 changes/business_event，防破坏历史链）。
 */
export class AddOperationAuditAuthorization1810000000000 implements MigrationInterface {
  name = 'AddOperationAuditAuthorization1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "operation_audit_logs" ADD "authorization" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "operation_audit_logs" DROP COLUMN "authorization"`);
  }
}
