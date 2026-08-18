import { MigrationInterface, QueryRunner } from "typeorm";

export class AddContracts1787013777636 implements MigrationInterface {
    name = 'AddContracts1787013777636'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "contracts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(200) NOT NULL, "counterparty" varchar(200) NOT NULL, "status" varchar(32) NOT NULL DEFAULT ('draft'), "amount" integer, "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_4e1de36dfe48eb55999a95e105" ON "contracts" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_4e1de36dfe48eb55999a95e105"`);
        await queryRunner.query(`DROP TABLE "contracts"`);
    }

}
