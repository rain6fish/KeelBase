// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * KB-5（docs/run-level-approval.spec.md §2.4）：ai_confirmation_requests 加 run 判别 + items 快照两列（可空）。
 * - kind：'single'（默认，单动作确认/审批）| 'run'（一次授权整批，token = runId）。
 * - run_items：run 批内动作快照 JSON（RunItem[]）；single 为 null。
 * 双方言均简单 ALTER ADD COLUMN；varchar/text 避开 sqlite/postgres enum 差异。
 */
export class AddAiConfirmationRunColumns1816000000000 implements MigrationInterface {
  name = 'AddAiConfirmationRunColumns1816000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_confirmation_requests" ADD "kind" varchar(16) DEFAULT 'single'`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_confirmation_requests" ADD "run_items" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_confirmation_requests" DROP COLUMN "run_items"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_confirmation_requests" DROP COLUMN "kind"`,
    );
  }
}
