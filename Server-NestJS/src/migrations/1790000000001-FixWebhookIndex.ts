// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 修复 PL-14 遗留：webhook_subscriptions 的 user_id 索引用了易读名
 * IDX_webhook_subscriptions_user，与实体元数据生成的 hash 名
 * IDX_56d0022083f41dadfd9c75a187 不一致，导致 migration:generate 漂移。
 * 改为 hash 名（sqlite + postgres 双驱动）。
 */
export class FixWebhookIndex1790000000001 implements MigrationInterface {
  name = 'FixWebhookIndex1790000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if ((queryRunner.connection.options as any).type === 'postgres') {
      await queryRunner.query(`DROP INDEX "public"."IDX_webhook_subscriptions_user"`);
      await queryRunner.query(`CREATE INDEX "IDX_56d0022083f41dadfd9c75a187" ON "webhook_subscriptions" ("user_id") `);
      return;
    }
    await queryRunner.query(`DROP INDEX "IDX_webhook_subscriptions_user"`);
    await queryRunner.query(`CREATE INDEX "IDX_56d0022083f41dadfd9c75a187" ON "webhook_subscriptions" ("user_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if ((queryRunner.connection.options as any).type === 'postgres') {
      await queryRunner.query(`DROP INDEX "public"."IDX_56d0022083f41dadfd9c75a187"`);
      await queryRunner.query(`CREATE INDEX "IDX_webhook_subscriptions_user" ON "webhook_subscriptions" ("user_id") `);
      return;
    }
    await queryRunner.query(`DROP INDEX "IDX_56d0022083f41dadfd9c75a187"`);
    await queryRunner.query(`CREATE INDEX "IDX_webhook_subscriptions_user" ON "webhook_subscriptions" ("user_id") `);
  }
}
