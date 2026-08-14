import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * RAG 向量检索（AI-5）：知识条目 embedding 表。
 *
 * postgres：建 ai_knowledge_embeddings 表（vector(1536) + HNSW 余弦索引 + FK 级联删除）。
 * sqlite：no-op（无向量类型），保证 CI migration-consistency 通过；向量功能仅 postgres 可用。
 */
export class AddKnowledgeEmbeddings1785992463517 implements MigrationInterface {
    name = 'AddKnowledgeEmbeddings1785992463517'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const dbType = (queryRunner.connection.options as any).type;
        if (dbType !== 'postgres') return;

        // 自包含启用 pgvector 扩展（生产库若未在 init 启用也能跑）
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

        await queryRunner.query(`CREATE TABLE "ai_knowledge_embeddings" (
            "id" SERIAL PRIMARY KEY,
            "article_id" integer NOT NULL,
            "embedding" vector(1536) NOT NULL,
            "model" varchar(64),
            "created_at" timestamptz DEFAULT now(),
            CONSTRAINT "UQ_article_id" UNIQUE ("article_id"),
            CONSTRAINT "FK_article_id" FOREIGN KEY ("article_id") REFERENCES "ai_knowledge_articles"("id") ON DELETE CASCADE
        )`);
        await queryRunner.query(`CREATE INDEX "IDX_ai_knowledge_embeddings_hnsw" ON "ai_knowledge_embeddings" USING hnsw ("embedding" vector_cosine_ops)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const dbType = (queryRunner.connection.options as any).type;
        if (dbType !== 'postgres') return;

        await queryRunner.query(`DROP INDEX "IDX_ai_knowledge_embeddings_hnsw"`);
        await queryRunner.query(`DROP TABLE "ai_knowledge_embeddings"`);
    }

}
