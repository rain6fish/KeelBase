import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserMemory1787000000000 implements MigrationInterface {
    name = 'AddUserMemory1787000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "user_memory" ("id" SERIAL NOT NULL, "user_id" character varying(36) NOT NULL, "type" character varying(32) NOT NULL DEFAULT 'fact', "content" text NOT NULL, "source" character varying(64), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "last_used_at" TIMESTAMP, "expires_at" TIMESTAMP, CONSTRAINT "PK_user_memory" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_user_memory_user_id" ON "user_memory" ("user_id") `);
            return;
        }

        await queryRunner.query(`CREATE TABLE "user_memory" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" varchar(36) NOT NULL, "type" varchar(32) NOT NULL DEFAULT ('fact'), "content" text NOT NULL, "source" varchar(64), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "last_used_at" datetime, "expires_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_user_memory_user_id" ON "user_memory" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`DROP INDEX "IDX_user_memory_user_id"`);
            await queryRunner.query(`DROP TABLE "user_memory"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_user_memory_user_id"`);
        await queryRunner.query(`DROP TABLE "user_memory"`);
    }

}
