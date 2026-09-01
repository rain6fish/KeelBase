// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from 'typeorm';

/** HS-4 建 headless_api_keys 表（sqlite + postgres 双驱动）。 */
export class AddHeadlessApiKeys1788100000000 implements MigrationInterface {
  name = 'AddHeadlessApiKeys1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query(`CREATE TABLE "headless_api_keys" ("id" SERIAL NOT NULL, "key_hash" character varying(64) NOT NULL, "name" character varying(100) NOT NULL, "owner_user_id" integer NOT NULL, "tool_whitelist" text, "quota_per_day" integer NOT NULL DEFAULT 0, "daily_used" integer NOT NULL DEFAULT 0, "quota_date" integer NOT NULL DEFAULT 0, "enabled" boolean NOT NULL DEFAULT true, "last_used_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_headless_api_keys_key" UNIQUE ("key_hash"), CONSTRAINT "PK_headless_api_keys" PRIMARY KEY ("id"))`);
      return;
    }
    await queryRunner.query(`CREATE TABLE "headless_api_keys" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "key_hash" varchar(64) NOT NULL, "name" varchar(100) NOT NULL, "owner_user_id" integer NOT NULL, "tool_whitelist" text, "quota_per_day" integer NOT NULL DEFAULT 0, "daily_used" integer NOT NULL DEFAULT 0, "quota_date" integer NOT NULL DEFAULT 0, "enabled" boolean NOT NULL DEFAULT (1), "last_used_at" datetime, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_headless_api_keys_key" UNIQUE ("key_hash"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "headless_api_keys"`);
  }
}
