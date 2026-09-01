// SPDX-License-Identifier: Apache-2.0

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddKnowledgeDocumentColumns1787200000000 implements MigrationInterface {
    name = 'AddKnowledgeDocumentColumns1787200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" ADD "sourceFile" character varying(255)`);
            await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" ADD "fileUrl" character varying(512)`);
            await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" ADD "docType" character varying(16)`);
            await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" ADD "chunkCount" integer`);
            return;
        }
        await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" ADD "sourceFile" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" ADD "fileUrl" varchar(512)`);
        await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" ADD "docType" varchar(16)`);
        await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" ADD "chunkCount" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (queryRunner.connection.options.type === 'postgres') {
            await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" DROP COLUMN "chunkCount"`);
            await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" DROP COLUMN "docType"`);
            await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" DROP COLUMN "fileUrl"`);
            await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" DROP COLUMN "sourceFile"`);
            return;
        }
        await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" DROP COLUMN "chunkCount"`);
        await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" DROP COLUMN "docType"`);
        await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" DROP COLUMN "fileUrl"`);
        await queryRunner.query(`ALTER TABLE "ai_knowledge_articles" DROP COLUMN "sourceFile"`);
    }

}
