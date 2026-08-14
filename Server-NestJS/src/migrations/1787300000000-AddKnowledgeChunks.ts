import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 知识库 chunks 表 — postgres-only（sqlite dev/test 不建，检索走全文）。
 * 无 TypeORM 实体，synchronize 不会创建，故必须走迁移。
 */
export class AddKnowledgeChunks1787300000000 implements MigrationInterface {
    name = 'AddKnowledgeChunks1787300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const dbType = (queryRunner.connection.options as any).type;
        if (dbType !== 'postgres') return;
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
        await queryRunner.query(`CREATE TABLE "ai_knowledge_chunks" ("id" SERIAL PRIMARY KEY, "article_id" integer NOT NULL, "chunk_index" integer NOT NULL, "content" text NOT NULL, "embedding" vector(1536), "model" character varying(64), "created_at" timestamptz DEFAULT now(), CONSTRAINT "UQ_article_chunk" UNIQUE ("article_id", "chunk_index"), CONSTRAINT "FK_chunk_article" FOREIGN KEY ("article_id") REFERENCES "ai_knowledge_articles"("id") ON DELETE CASCADE)`);
        await queryRunner.query(`CREATE INDEX "IDX_ai_knowledge_chunks_hnsw" ON "ai_knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops) WHERE "embedding" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const dbType = (queryRunner.connection.options as any).type;
        if (dbType !== 'postgres') return;
        await queryRunner.query(`DROP INDEX "IDX_ai_knowledge_chunks_hnsw"`);
        await queryRunner.query(`DROP TABLE "ai_knowledge_chunks"`);
    }

}
