import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSuppliers1786980324331 implements MigrationInterface {
    name = 'AddSuppliers1786980324331'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "suppliers" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(200) NOT NULL, "contact" varchar(200) NOT NULL, "status" varchar(32) NOT NULL DEFAULT ('active'), "riskLevel" varchar(32) NOT NULL DEFAULT ('low'), "annualSpend" integer, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_b3aba33228acd59f2d734c31b8" ON "suppliers" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_b3aba33228acd59f2d734c31b8"`);
        await queryRunner.query(`DROP TABLE "suppliers"`);
    }

}
