// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEventReminder1785978305379 implements MigrationInterface {
    name = 'AddEventReminder1785978305379'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_7285fde447fa02fbe13a141eff"`);
        await queryRunner.query(`CREATE TABLE "temporary_events" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "description" text, "startTime" datetime NOT NULL, "endTime" datetime NOT NULL, "location" varchar(200), "colorRole" integer NOT NULL DEFAULT (0), "isCancelled" boolean NOT NULL DEFAULT (0), "isRecurring" boolean NOT NULL DEFAULT (0), "userId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "reminder_minutes" integer, CONSTRAINT "FK_9929fa8516afa13f87b41abb263" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_events"("id", "title", "description", "startTime", "endTime", "location", "colorRole", "isCancelled", "isRecurring", "userId", "createdAt", "updatedAt") SELECT "id", "title", "description", "startTime", "endTime", "location", "colorRole", "isCancelled", "isRecurring", "userId", "createdAt", "updatedAt" FROM "events"`);
        await queryRunner.query(`DROP TABLE "events"`);
        await queryRunner.query(`ALTER TABLE "temporary_events" RENAME TO "events"`);
        await queryRunner.query(`CREATE INDEX "IDX_7285fde447fa02fbe13a141eff" ON "events" ("userId", "startTime") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_7285fde447fa02fbe13a141eff"`);
        await queryRunner.query(`ALTER TABLE "events" RENAME TO "temporary_events"`);
        await queryRunner.query(`CREATE TABLE "events" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "description" text, "startTime" datetime NOT NULL, "endTime" datetime NOT NULL, "location" varchar(200), "colorRole" integer NOT NULL DEFAULT (0), "isCancelled" boolean NOT NULL DEFAULT (0), "isRecurring" boolean NOT NULL DEFAULT (0), "userId" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_9929fa8516afa13f87b41abb263" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "events"("id", "title", "description", "startTime", "endTime", "location", "colorRole", "isCancelled", "isRecurring", "userId", "createdAt", "updatedAt") SELECT "id", "title", "description", "startTime", "endTime", "location", "colorRole", "isCancelled", "isRecurring", "userId", "createdAt", "updatedAt" FROM "temporary_events"`);
        await queryRunner.query(`DROP TABLE "temporary_events"`);
        await queryRunner.query(`CREATE INDEX "IDX_7285fde447fa02fbe13a141eff" ON "events" ("userId", "startTime") `);
    }

}
