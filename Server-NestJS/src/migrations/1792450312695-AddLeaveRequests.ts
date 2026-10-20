// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Leave requests (vertical template: OA approval).
 * Generated with `migration:generate`, then given its postgres branch by hand — the repository's
 * committed migrations are dual-dialect, while the generator emits sqlite only.
 *
 * 请假申请（垂直模板：OA 审批）。SQL 由 `migration:generate` 生成，postgres 分支按本仓
 * 双方言迁移的惯例手写补齐（生成器只产出 sqlite 方言）。
 */
export class AddLeaveRequests1792450312695 implements MigrationInterface {
    name = 'AddLeaveRequests1792450312695'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "leave_requests" ("id" SERIAL NOT NULL, "requestNo" character varying(200) NOT NULL, "leaveType" character varying(32) NOT NULL DEFAULT 'annual', "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP NOT NULL, "days" integer NOT NULL, "reason" text, "status" character varying(32) DEFAULT 'pending', "user_id" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "version" integer NOT NULL DEFAULT 1, "deleted_at" TIMESTAMP, CONSTRAINT "PK_d3abcf9a16cef1450129e06fa9f" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_6d320737541c7c4d2a6f0f9d91" ON "leave_requests"  ("user_id") `);
            return;
        }
        await queryRunner.query(`CREATE TABLE "leave_requests" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "requestNo" varchar(200) NOT NULL, "leaveType" varchar(32) NOT NULL DEFAULT ('annual'), "startDate" datetime NOT NULL, "endDate" datetime NOT NULL, "days" integer NOT NULL, "reason" text, "status" varchar(32) DEFAULT ('pending'), "user_id" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "version" integer NOT NULL DEFAULT (1), "deleted_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_6d320737541c7c4d2a6f0f9d91" ON "leave_requests" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`DROP INDEX "public"."IDX_6d320737541c7c4d2a6f0f9d91"`);
            await queryRunner.query(`DROP TABLE "leave_requests"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_6d320737541c7c4d2a6f0f9d91"`);
        await queryRunner.query(`DROP TABLE "leave_requests"`);
    }

}
