// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * BA 异常行为基线：告警事件表（docs/ai-behavior-baseline.spec.md §7）。
 *
 * 只建这一张表 + 两个索引——**不夹带** `migration:generate` 在本机 dev 库上顺带探出的其它结构差异
 * （那是本地库与迁移的既有不同步，与本能力无关）。
 * 索引名与 PK 约束名取自 TypeORM 命名策略对当前实体元数据的实际计算值，故与实体装饰器一致、不产生一致性漂移。
 */
export class AddAiBehaviorAlerts1824000000000 implements MigrationInterface {
    name = 'AddAiBehaviorAlerts1824000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`CREATE TABLE "ai_behavior_alerts" ("id" SERIAL NOT NULL, "rule" character varying(8) NOT NULL, "level" character varying(16) NOT NULL, "subject_kind" character varying(16) NOT NULL, "subject_id" character varying(64) NOT NULL, "conversation_id" character varying, "title" character varying(128) NOT NULL, "detail" text NOT NULL, "evidence_json" text NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'open', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "decided_at" TIMESTAMP, CONSTRAINT "PK_da45349efe1b7ed218a27ebce35" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_b5a7643e8f1a8746391d49582e" ON "ai_behavior_alerts" ("rule", "subject_kind", "subject_id", "created_at") `);
            await queryRunner.query(`CREATE INDEX "IDX_33141d489e0f445ff423d3cf9a" ON "ai_behavior_alerts" ("status", "created_at") `);
            return;
        }
        await queryRunner.query(`CREATE TABLE "ai_behavior_alerts" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "rule" varchar(8) NOT NULL, "level" varchar(16) NOT NULL, "subject_kind" varchar(16) NOT NULL, "subject_id" varchar(64) NOT NULL, "conversation_id" varchar, "title" varchar(128) NOT NULL, "detail" text NOT NULL, "evidence_json" text NOT NULL, "status" varchar(16) NOT NULL DEFAULT ('open'), "created_at" datetime NOT NULL DEFAULT (datetime('now')), "decided_at" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_b5a7643e8f1a8746391d49582e" ON "ai_behavior_alerts" ("rule", "subject_kind", "subject_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_33141d489e0f445ff423d3cf9a" ON "ai_behavior_alerts" ("status", "created_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_33141d489e0f445ff423d3cf9a"`);
        await queryRunner.query(`DROP INDEX "IDX_b5a7643e8f1a8746391d49582e"`);
        await queryRunner.query(`DROP TABLE "ai_behavior_alerts"`);
    }

}
