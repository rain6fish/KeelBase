import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAccountCompliance1786004759010 implements MigrationInterface {
    name = 'AddAccountCompliance1786004759010'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "phone_verification_codes" ("id" SERIAL NOT NULL, "phone" character varying(20) NOT NULL, "code_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP NOT NULL, "used" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_phone_verification_codes" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_344356702027c0fab48ada4b7f" ON "phone_verification_codes" ("phone") `);
            await queryRunner.query(`ALTER TABLE "users" ADD "phone_hash" character varying(64)`);
            await queryRunner.query(`ALTER TABLE "users" ADD "phone_verified" boolean NOT NULL DEFAULT false`);
            return;
        }

        await queryRunner.query(`CREATE TABLE "phone_verification_codes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "phone" varchar(20) NOT NULL, "code_hash" varchar(64) NOT NULL, "expires_at" datetime NOT NULL, "used" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_344356702027c0fab48ada4b7f" ON "phone_verification_codes" ("phone") `);
        await queryRunner.query(`ALTER TABLE "users" ADD "phone_hash" varchar(64)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "phone_verified" boolean NOT NULL DEFAULT (0)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone_verified"`);
            await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone_hash"`);
            await queryRunner.query(`DROP INDEX "IDX_344356702027c0fab48ada4b7f"`);
            await queryRunner.query(`DROP TABLE "phone_verification_codes"`);
            return;
        }
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone_verified"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phone_hash"`);
        await queryRunner.query(`DROP INDEX "IDX_344356702027c0fab48ada4b7f"`);
        await queryRunner.query(`DROP TABLE "phone_verification_codes"`);
    }

}
