// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * AI Approval 旗舰应用：app_policies / app_requests 表。
 * 双驱动：postgres（SERIAL）先建并 return；sqlite（AUTOINCREMENT）。
 * 索引名取自 migration:generate 输出（TypeORM hash 名）。
 */
export class AddApproval1786973997072 implements MigrationInterface {
    name = 'AddApproval1786973997072'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if ((queryRunner.connection.options as any).type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "app_policies" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "type" character varying(32) NOT NULL DEFAULT 'general', "maxAmount" double precision NOT NULL DEFAULT '1000', "description" text, "active" boolean NOT NULL DEFAULT true, "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_281043a9281e9da768ae4160a0f" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_a8fef367db937cf2ad3a10c807" ON "app_policies" ("type") `);
            await queryRunner.query(`CREATE TABLE "app_requests" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "type" character varying(32) NOT NULL DEFAULT 'general', "amount" double precision NOT NULL DEFAULT '0', "reason" text NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', "riskLevel" character varying(16) NOT NULL DEFAULT 'low', "aiRecommendation" text, "requester_id" integer, "reviewer_id" integer, "decidedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_f60a8554fab5ee270913a407dcd" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_ee7c611eacb05019bf0b513461" ON "app_requests" ("status") `);
            await queryRunner.query(`CREATE INDEX "IDX_99404a2758b3cf4c6086492f02" ON "app_requests" ("requester_id") `);
            return;
        }

        await queryRunner.query(`CREATE TABLE "app_policies" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "type" varchar(32) NOT NULL DEFAULT ('general'), "maxAmount" float NOT NULL DEFAULT (1000), "description" text, "active" boolean NOT NULL DEFAULT (1), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_a8fef367db937cf2ad3a10c807" ON "app_policies" ("type") `);
        await queryRunner.query(`CREATE TABLE "app_requests" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar(200) NOT NULL, "type" varchar(32) NOT NULL DEFAULT ('general'), "amount" float NOT NULL DEFAULT (0), "reason" text NOT NULL, "status" varchar(16) NOT NULL DEFAULT ('pending'), "riskLevel" varchar(16) NOT NULL DEFAULT ('low'), "aiRecommendation" text, "requester_id" integer, "reviewer_id" integer, "decidedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deleted_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_ee7c611eacb05019bf0b513461" ON "app_requests" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_99404a2758b3cf4c6086492f02" ON "app_requests" ("requester_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_99404a2758b3cf4c6086492f02"`);
        await queryRunner.query(`DROP INDEX "IDX_ee7c611eacb05019bf0b513461"`);
        await queryRunner.query(`DROP TABLE "app_requests"`);
        await queryRunner.query(`DROP INDEX "IDX_a8fef367db937cf2ad3a10c807"`);
        await queryRunner.query(`DROP TABLE "app_policies"`);
    }

}
