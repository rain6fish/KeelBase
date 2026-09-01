// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotificationTargets1785986020373 implements MigrationInterface {
    name = 'AddNotificationTargets1785986020373'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" ADD "target_type" varchar(32)`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "target_id" varchar(64)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_f8119e95a07eeea356486ed134"`);
        await queryRunner.query(`CREATE TABLE "temporary_notifications" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "title" varchar(200) NOT NULL, "body" text, "type" varchar(32) NOT NULL DEFAULT ('system'), "is_read" boolean NOT NULL DEFAULT (0), "link" varchar(255), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "temporary_notifications"("id", "user_id", "title", "body", "type", "is_read", "link", "createdAt", "updatedAt") SELECT "id", "user_id", "title", "body", "type", "is_read", "link", "createdAt", "updatedAt" FROM "notifications"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`ALTER TABLE "temporary_notifications" RENAME TO "notifications"`);
        await queryRunner.query(`CREATE INDEX "IDX_f8119e95a07eeea356486ed134" ON "notifications" ("user_id", "createdAt") `);
    }

}
