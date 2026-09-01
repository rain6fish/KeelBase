// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/** D5 Agent Registry：ai_agents 表（已注册 Agent 定义，最小版从 headless key 注册） */
export class AddAiAgents1794000000000 implements MigrationInterface {
    name = 'AddAiAgents1794000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "ai_agents" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "owner_id" integer, "purpose" character varying(255), "capabilities" text, "trust_level" character varying(8) NOT NULL DEFAULT 'R1', "description" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ai_agents_name" UNIQUE ("name"), CONSTRAINT "PK_ai_agents" PRIMARY KEY ("id"))`);
            return;
        }
        await queryRunner.query(`CREATE TABLE "ai_agents" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar(100) NOT NULL, "owner_id" integer, "purpose" varchar(255), "capabilities" text, "trust_level" varchar(8) NOT NULL DEFAULT ('R1'), "description" varchar(255), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_ai_agents_name" ON "ai_agents" ("name") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`DROP TABLE "ai_agents"`);
            return;
        }
        await queryRunner.query(`DROP INDEX "UQ_ai_agents_name"`);
        await queryRunner.query(`DROP TABLE "ai_agents"`);
    }

}
