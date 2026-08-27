import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 对齐 ai_agents.name 唯一性与实体定义：AddAiAgents 迁移 postgres 分支手写为
 * UNIQUE CONSTRAINT，而实体用 @Index('UQ_ai_agents_name', { unique: true })（UNIQUE INDEX），
 * CLI 迁移一致性校验（migration:generate）据此报漂移。已执行的 AddAiAgents 不可改，
 * 故用本修正迁移把 postgres 端换成与实体一致的 UNIQUE INDEX。
 */
export class FixAiAgentsNameUniqueIndex1794500000000 implements MigrationInterface {
    name = 'FixAiAgentsNameUniqueIndex1794500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "ai_agents" DROP CONSTRAINT "UQ_ai_agents_name"`);
            await queryRunner.query(`CREATE UNIQUE INDEX "UQ_ai_agents_name" ON "ai_agents" ("name")`);
            return;
        }
        // sqlite：AddAiAgents 已建 UNIQUE INDEX，与实体一致，无需变更
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`DROP INDEX "public"."UQ_ai_agents_name"`);
            await queryRunner.query(`ALTER TABLE "ai_agents" ADD CONSTRAINT "UQ_ai_agents_name" UNIQUE ("name")`);
            return;
        }
        // sqlite：无变更
    }
}
