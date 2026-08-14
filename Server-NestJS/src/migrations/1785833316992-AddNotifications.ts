import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotifications1785833316992 implements MigrationInterface {
    name = 'AddNotifications1785833316992'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "notifications" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "title" varchar(200) NOT NULL, "body" text, "type" varchar(32) NOT NULL DEFAULT ('system'), "is_read" boolean NOT NULL DEFAULT (0), "link" varchar(255), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_f8119e95a07eeea356486ed134" ON "notifications" ("user_id", "createdAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_f8119e95a07eeea356486ed134"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
    }

}
