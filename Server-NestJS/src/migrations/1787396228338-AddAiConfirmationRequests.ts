// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAiConfirmationRequests1787396228338 implements MigrationInterface {
    name = 'AddAiConfirmationRequests1787396228338'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "ai_confirmation_requests" ("id" SERIAL NOT NULL, "token" character varying(64) NOT NULL, "tool_name" character varying(64) NOT NULL, "args" text NOT NULL, "operator_id" character varying NOT NULL, "conversation_id" character varying, "risk_level" character varying(4) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', "approver_id" character varying, "decided_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_2d2d4748c94dd7ffb6a4f541226" UNIQUE ("token"), CONSTRAINT "PK_4be5f88b4f2eaf5a7e1b5c1d5f3" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_0501628d59ad564c9e738f4ca2" ON "ai_confirmation_requests" ("status", "created_at") `);
            return;
        }
        await queryRunner.query(`CREATE TABLE "ai_confirmation_requests" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "token" varchar(64) NOT NULL, "tool_name" varchar(64) NOT NULL, "args" text NOT NULL, "operator_id" varchar NOT NULL, "conversation_id" varchar, "risk_level" varchar(4) NOT NULL, "status" varchar(16) NOT NULL DEFAULT ('pending'), "approver_id" varchar, "decided_at" datetime, "created_at" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_2d2d4748c94dd7ffb6a4f541226" UNIQUE ("token"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0501628d59ad564c9e738f4ca2" ON "ai_confirmation_requests" ("status", "created_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`DROP INDEX "IDX_0501628d59ad564c9e738f4ca2"`);
            await queryRunner.query(`DROP TABLE "ai_confirmation_requests"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "IDX_0501628d59ad564c9e738f4ca2"`);
        await queryRunner.query(`DROP TABLE "ai_confirmation_requests"`);
    }

}
