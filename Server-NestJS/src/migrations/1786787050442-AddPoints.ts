import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPoints1786787050442 implements MigrationInterface {
    name = 'AddPoints1786787050442'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "points_entries" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "points" integer NOT NULL, "reason" character varying(32) NOT NULL, "description" character varying(128), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_points_entries" PRIMARY KEY ("id"), CONSTRAINT "FK_8982f4807d82b988095541e9e80" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
            await queryRunner.query(`CREATE INDEX "IDX_0d0be426ab7968539cb7785b54" ON "points_entries" ("user_id", "createdAt")`);
            return;
        }
        await queryRunner.query(`CREATE TABLE "points_entries" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "points" integer NOT NULL, "reason" varchar(32) NOT NULL, "description" varchar(128), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_0d0be426ab7968539cb7785b54" ON "points_entries" ("user_id", "createdAt") `);
        await queryRunner.query(`DROP INDEX "IDX_0d0be426ab7968539cb7785b54"`);
        await queryRunner.query(`CREATE TABLE "temporary_points_entries" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "points" integer NOT NULL, "reason" varchar(32) NOT NULL, "description" varchar(128), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_8982f4807d82b988095541e9e80" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_points_entries"("id", "user_id", "points", "reason", "description", "createdAt", "updatedAt") SELECT "id", "user_id", "points", "reason", "description", "createdAt", "updatedAt" FROM "points_entries"`);
        await queryRunner.query(`DROP TABLE "points_entries"`);
        await queryRunner.query(`ALTER TABLE "temporary_points_entries" RENAME TO "points_entries"`);
        await queryRunner.query(`CREATE INDEX "IDX_0d0be426ab7968539cb7785b54" ON "points_entries" ("user_id", "createdAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`DROP INDEX "IDX_0d0be426ab7968539cb7785b54"`);
            await queryRunner.query(`DROP TABLE "points_entries"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_0d0be426ab7968539cb7785b54"`);
        await queryRunner.query(`ALTER TABLE "points_entries" RENAME TO "temporary_points_entries"`);
        await queryRunner.query(`CREATE TABLE "points_entries" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "points" integer NOT NULL, "reason" varchar(32) NOT NULL, "description" varchar(128), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "points_entries"("id", "user_id", "points", "reason", "description", "createdAt", "updatedAt") SELECT "id", "user_id", "points", "reason", "description", "createdAt", "updatedAt" FROM "temporary_points_entries"`);
        await queryRunner.query(`DROP TABLE "temporary_points_entries"`);
        await queryRunner.query(`CREATE INDEX "IDX_0d0be426ab7968539cb7785b54" ON "points_entries" ("user_id", "createdAt") `);
        await queryRunner.query(`DROP INDEX "IDX_0d0be426ab7968539cb7785b54"`);
        await queryRunner.query(`DROP TABLE "points_entries"`);
    }

}
