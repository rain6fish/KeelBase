// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFollowupPlans1829200000000 implements MigrationInterface {
    name = 'AddFollowupPlans1829200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "followup_plans" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "priority" character varying(32) NOT NULL DEFAULT 'low', "reason" text, "dueDate" TIMESTAMP, "status" character varying(32) NOT NULL DEFAULT 'planned', "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "version" integer NOT NULL, "deleted_at" TIMESTAMP, CONSTRAINT "PK_613e0dc1ad48a19c4a8df7f7088" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_31abc4aef2940cd4b330480d21" ON "followup_plans"  ("user_id") `);
            return;
        }
        await queryRunner.query(`CREATE TABLE "followup_plans" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "priority" varchar(32) NOT NULL DEFAULT ('low'), "reason" text, "dueDate" datetime, "status" varchar(32) NOT NULL DEFAULT ('planned'), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL, "deleted_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_31abc4aef2940cd4b330480d21" ON "followup_plans" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`DROP INDEX "public"."IDX_31abc4aef2940cd4b330480d21"`);
            await queryRunner.query(`DROP TABLE "followup_plans"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_31abc4aef2940cd4b330480d21"`);
        await queryRunner.query(`DROP TABLE "followup_plans"`);
    }

}
