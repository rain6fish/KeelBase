// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssetLoans1842000000000 implements MigrationInterface {
    name = 'AddAssetLoans1842000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "asset_loans" ("id" SERIAL NOT NULL, "assetName" character varying(200) NOT NULL, "assetTag" character varying(200) NOT NULL, "purpose" text, "dueDate" TIMESTAMP, "status" character varying(32) NOT NULL DEFAULT 'active', "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "version" integer NOT NULL DEFAULT 1, "deleted_at" TIMESTAMP, CONSTRAINT "PK_31d2beb91a8c6b5b439a41a8719" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_3c3c2130e398a91733b33bc45d" ON "asset_loans"  ("user_id") `);
            return;
        }
        await queryRunner.query(`CREATE TABLE "asset_loans" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "assetName" varchar(200) NOT NULL, "assetTag" varchar(200) NOT NULL, "purpose" text, "dueDate" datetime, "status" varchar(32) NOT NULL DEFAULT ('active'), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "deleted_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_3c3c2130e398a91733b33bc45d" ON "asset_loans" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`DROP INDEX "public"."IDX_3c3c2130e398a91733b33bc45d"`);
            await queryRunner.query(`DROP TABLE "asset_loans"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_3c3c2130e398a91733b33bc45d"`);
        await queryRunner.query(`DROP TABLE "asset_loans"`);
    }

}
