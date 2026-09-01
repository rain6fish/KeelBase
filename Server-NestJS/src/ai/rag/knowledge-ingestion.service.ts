// SPDX-License-Identifier: Apache-2.0

/**
 * 知识库文档摄入服务 — 切块 + 向量化 + 持久化 chunks
 *
 * 生产者（enqueue）：QUEUE_ENABLED + 队列可用 → BullMQ；否则同步执行。
 * 单一事实源 ingestArticle：队列 processor / 同步降级 / update 重切块共用。
 *
 * ai_knowledge_chunks 表为 postgres-only（无实体，sqlite dev/test 不建表）。
 * sqlite 下仅做切块 + 更新 chunkCount，不持久化 chunks（检索走全文）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { KnowledgeArticle } from './knowledge-article.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { chunkText } from './chunk-text';

export interface KnowledgeIngestionJobData {
  articleId: number;
}

@Injectable()
export class KnowledgeIngestionService {
  private readonly logger = new Logger(KnowledgeIngestionService.name);

  constructor(
    @InjectRepository(KnowledgeArticle)
    private readonly articleRepo: Repository<KnowledgeArticle>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Optional()
    private readonly embeddingsService?: EmbeddingsService,
    @Optional()
    private readonly configService?: ConfigService,
    @Optional()
    @InjectQueue('knowledge')
    private readonly knowledgeQueue?: Queue | null,
  ) {}

  /** 生产端：入队（失败/降级 → 同步执行）。返回是否入队。 */
  async enqueue(articleId: number): Promise<boolean> {
    try {
      if (
        this.configService?.get<boolean>('QUEUE_ENABLED', true) &&
        this.knowledgeQueue
      ) {
        await this.knowledgeQueue.add(
          'ingest',
          { articleId },
          { removeOnComplete: true },
        );
        return true;
      }
    } catch (err) {
      this.logger.warn(
        `[Knowledge] enqueue failed, fallback to sync: ${(err as Error).message}`,
      );
    }
    await this.ingestById(articleId);
    return false;
  }

  /** 按 id 加载并摄入；文章不存在（删除中）返回 null。 */
  async ingestById(articleId: number): Promise<number | null> {
    const article = await this.articleRepo.findOneBy({ id: articleId });
    if (!article) {
      this.logger.warn(`[Knowledge] ingest skip: article ${articleId} not found`);
      return null;
    }
    return this.ingestArticle(article);
  }

  /**
   * 单一事实源：切块 →（postgres）wipe + 向量化 upsert / 文本块 upsert → 更新 chunkCount。
   * 幂等：先删后插。
   */
  async ingestArticle(article: KnowledgeArticle): Promise<number> {
    const chunks = chunkText(article.content ?? '');
    const dbType = (this.dataSource.options as any).type;

    if (dbType === 'postgres') {
      try {
        // wipe 旧 chunks（幂等）
        await this.dataSource.query(
          `DELETE FROM "ai_knowledge_chunks" WHERE "article_id" = $1`,
          [article.id],
        );

        const model = this.configService?.get<string>(
          'EMBEDDING_MODEL',
          'text-embedding-3-small',
        ) ?? 'text-embedding-3-small';
        const vectorOn =
          !!this.embeddingsService &&
          this.embeddingsService.isAvailable(dbType);

        let embedFailed = false;
        for (let i = 0; i < chunks.length; i++) {
          let embedding: number[] | null = null;
          if (vectorOn && !embedFailed) {
            try {
              embedding = await this.embeddingsService!.embed(chunks[i]);
            } catch (err) {
              this.logger.warn(
                `[Knowledge] embed failed chunk=${i} article=${article.id}, degrade to text-only: ${(err as Error).message}`,
              );
              embedFailed = true; // 整篇降级为文本块（保持一致）
            }
          }
          await this.dataSource.query(
            `INSERT INTO "ai_knowledge_chunks" ("article_id", "chunk_index", "content", "embedding", "model")
             VALUES ($1, $2, $3, $4::vector, $5)
             ON CONFLICT ("article_id", "chunk_index")
             DO UPDATE SET "content" = EXCLUDED."content",
                           "embedding" = EXCLUDED."embedding",
                           "model" = EXCLUDED."model"`,
            [
              article.id,
              i,
              chunks[i],
              embedding ? `[${embedding.join(',')}]` : null,
              embedding ? model : null,
            ],
          );
        }
      } catch (err) {
        // chunks 表不存在（postgres 迁移未跑）或写入失败 → 静默，全文检索仍可用
        this.logger.warn(
          `[Knowledge] chunk persist failed article=${article.id}: ${(err as Error).message}`,
        );
      }
    }

    await this.articleRepo.update(article.id, { chunkCount: chunks.length });
    return chunks.length;
  }
}
