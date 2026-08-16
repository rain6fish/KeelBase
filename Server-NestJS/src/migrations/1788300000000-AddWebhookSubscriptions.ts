import { MigrationInterface, QueryRunner } from 'typeorm';

/** PL-14 建 webhook_subscriptions 表（sqlite + postgres 双驱动）。 */
export class AddWebhookSubscriptions1788300000000 implements MigrationInterface {
  name = 'AddWebhookSubscriptions1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(
        `CREATE TABLE "webhook_subscriptions" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "name" character varying(100) NOT NULL, "url" character varying(512) NOT NULL, "events" text NOT NULL, "secret" character varying(64) NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_webhook_subscriptions" PRIMARY KEY ("id"))`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_webhook_subscriptions_user" ON "webhook_subscriptions" ("user_id") `,
      );
      return;
    }
    await queryRunner.query(
      `CREATE TABLE "webhook_subscriptions" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "name" varchar(100) NOT NULL, "url" varchar(512) NOT NULL, "events" text NOT NULL, "secret" varchar(64) NOT NULL, "enabled" boolean NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_subscriptions_user" ON "webhook_subscriptions" ("user_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "webhook_subscriptions"`);
  }
}
