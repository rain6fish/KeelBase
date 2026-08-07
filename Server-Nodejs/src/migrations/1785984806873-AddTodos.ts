import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTodos1785984806873 implements MigrationInterface {
    name = 'AddTodos1785984806873'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "todos" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "description" text, "completed" boolean NOT NULL DEFAULT (0), "due_date" datetime, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_b13821410577fdeac87b7190a3" ON "todos" ("user_id", "completed") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_b13821410577fdeac87b7190a3"`);
        await queryRunner.query(`DROP TABLE "todos"`);
    }

}
