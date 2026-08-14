import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPushTokens1785911692442 implements MigrationInterface {
    name = 'AddPushTokens1785911692442'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "push_tokens" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "device_id" varchar(64), "platform" varchar(16) NOT NULL, "token" varchar(255) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_869b4a9ba2c9e030aafc4b7dc7a" UNIQUE ("token"))`);
        await queryRunner.query(`CREATE INDEX "IDX_94c371aff70dedeb89dae39f44" ON "push_tokens" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_88a834039a1338d42063f8002d" ON "push_tokens" ("user_id", "platform") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_88a834039a1338d42063f8002d"`);
        await queryRunner.query(`DROP INDEX "IDX_94c371aff70dedeb89dae39f44"`);
        await queryRunner.query(`DROP TABLE "push_tokens"`);
    }

}
