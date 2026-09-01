// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A-1 字段级变更留痕：operation_audit_logs 加 changes（before/after diff JSON）+ business_event（业务事件归一化）。
 * 两列均可空，postgres / sqlite 均简单 ALTER ADD COLUMN（sqlite 支持 nullable 列 ADD）。
 * changes 不入审计哈希链（哈希链只覆盖既有核心字段，防破坏历史链）。
 */
export class AddOperationAuditChanges1796000000000 implements MigrationInterface {
  name = 'AddOperationAuditChanges1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "operation_audit_logs" ADD "changes" text`);
    await queryRunner.query(`ALTER TABLE "operation_audit_logs" ADD "business_event" varchar(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "operation_audit_logs" DROP COLUMN "business_event"`);
    await queryRunner.query(`ALTER TABLE "operation_audit_logs" DROP COLUMN "changes"`);
  }
}
