// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * §22.16 A-1 业务行为取证：ai_audit_logs 加 business_event（业务事件归一化）+ evidence（Decision Evidence JSON）。
 * 两列均可空，postgres / sqlite 均简单 ALTER ADD COLUMN。
 * 两列均不入审计哈希链（_payload 两侧恒 null，同 feedback 前例——防破坏历史链，展示/证据包用）。
 */
export class AddAiAuditBusinessEventEvidence1800000000000 implements MigrationInterface {
  name = 'AddAiAuditBusinessEventEvidence1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "business_event" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" ADD "evidence" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "evidence"`);
    await queryRunner.query(`ALTER TABLE "ai_audit_logs" DROP COLUMN "business_event"`);
  }
}
