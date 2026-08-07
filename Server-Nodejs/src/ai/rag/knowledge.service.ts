/**
 * 知识库服务 — 管理知识条目 + 检索（向量优先，全文降级）
 *
 * 检索降级链：向量检索（pgvector + embedding）→ 全文搜索（LIKE 兜底）。
 * 向量不可用（无配置 / sqlite / 查询异常）时静默降级，不影响业务。
 */

import { Injectable, NotFoundException, Logger, Optional, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { extname, basename } from 'path';
import { KnowledgeArticle } from './knowledge-article.entity';
import { CreateKnowledgeDto, UpdateKnowledgeDto } from './knowledge.dto';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { KnowledgeIngestionService } from './knowledge-ingestion.service';
import { detectDocType, parseDocument, MAX_DOC_CHARS, DocType } from './document-parser';
import { chunkText } from './chunk-text';
import { validateMagicBytes } from '../../common/utils/file-validator';
import { STORAGE_SERVICE } from '../../storage/storage.service';
import type { StorageService } from '../../storage/storage.service';
import { withSpan } from '../../common/tracing/tracer';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectRepository(KnowledgeArticle)
    private readonly articleRepo: Repository<KnowledgeArticle>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Optional()
    private readonly embeddingsService?: EmbeddingsService,
    private readonly configService?: ConfigService,
    @Optional()
    @Inject(STORAGE_SERVICE)
    private readonly storageService?: StorageService,
    @Optional()
    private readonly ingestionService?: KnowledgeIngestionService,
  ) {}

  async create(dto: CreateKnowledgeDto): Promise<KnowledgeArticle> {
    const article = this.articleRepo.create(dto);
    const saved = await this.articleRepo.save(article);
    await this.embedForArticle(saved.id, saved.title, saved.content);
    return saved;
  }

  /**
   * 上传文档入库：校验 → 解析 → 存原文件 → 建 article（全文为 content）→ 异步摄入 chunks。
   * 返回文章 + queued 标志（true=队列，false=同步完成）。
   */
  async createDocument(params: {
    buffer: Buffer;
    originalName: string;
    mimetype: string;
    title?: string;
    category?: string;
  }): Promise<KnowledgeArticle & { queued: boolean }> {
    const ext = extname(params.originalName).toLowerCase();
    const docType: DocType | null = detectDocType(ext);
    if (!docType) {
      throw new BadRequestException(`不允许的文件类型: ${ext}`);
    }

    // 魔数校验（客户端 MIME 不可信，结合扩展名双保险）
    validateMagicBytes(params.buffer, params.mimetype);

    // 解析文本
    let text: string;
    try {
      text = (await parseDocument(params.buffer, docType)).trim();
    } catch {
      throw new BadRequestException('文档解析失败，请确认文件未损坏');
    }
    if (!text) {
      throw new BadRequestException('文档内容为空');
    }
    if (text.length > MAX_DOC_CHARS) {
      throw new BadRequestException('文档过大，请拆分后上传');
    }

    // 默认标题 = 文件名（去扩展名），截断 200
    const fallbackTitle = basename(params.originalName, ext);
    const title = (params.title?.trim() || fallbackTitle).slice(0, 200);

    let fileUrl: string | undefined;
    try {
      fileUrl = await this.storageService?.save(
        params.buffer,
        params.originalName,
        params.mimetype,
      );
    } catch (err) {
      this.logger.warn(
        `[Knowledge] save file failed ${params.originalName}: ${(err as Error).message}`,
      );
    }

    try {
      const article = this.articleRepo.create({
        title,
        content: text,
        category: params.category,
        sourceFile: params.originalName,
        fileUrl,
        docType,
        chunkCount: chunkText(text).length,
      });
      const saved = await this.articleRepo.save(article);

      // 异步摄入（切块 + 向量化）；失败降级同步
      const queued = this.ingestionService
        ? await this.ingestionService.enqueue(saved.id)
        : false;

      return { ...saved, queued };
    } catch (err) {
      // 建文章失败 → best-effort 删已存原文件
      if (fileUrl) {
        try {
          await this.storageService?.delete(fileUrl);
        } catch {
          // ignore
        }
      }
      throw err;
    }
  }

  async findOne(id: number): Promise<KnowledgeArticle> {
    const article = await this.articleRepo.findOneBy({ id });
    if (!article) {
      throw new NotFoundException('知识条目不存在');
    }
    return article;
  }

  async findAll(options: {
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: KnowledgeArticle[]; total: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const where = options.q
      ? [
          { title: Like(`%${options.q}%`) },
          { content: Like(`%${options.q}%`) },
          { category: Like(`%${options.q}%`) },
        ]
      : undefined;

    const [items, total] = await this.articleRepo.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  /**
   * 检索知识库（RAG 检索入口）。向量优先，失败降级全文。签名不变（RagAgent 零改动）。
   */
  async search(query: string, limit = 5): Promise<KnowledgeArticle[]> {
    const keyword = query.trim();
    if (!keyword) return [];

    return withSpan('knowledge.search', async () => {
      return this.searchImpl(keyword, limit);
    }, { 'knowledge.query_len': keyword.length, 'knowledge.limit': limit });
  }

  private async searchImpl(keyword: string, limit: number): Promise<KnowledgeArticle[]> {
    if (this.isVectorAvailable()) {
      try {
        return await this.vectorSearch(keyword, limit);
      } catch (err) {
        this.logger.warn(`[RAG] vector search failed, fallback to full-text: ${(err as Error).message}`);
      }
    }
    return this.fullTextSearch(keyword, limit);
  }

  async update(id: number, dto: UpdateKnowledgeDto): Promise<KnowledgeArticle> {
    await this.findOne(id);
    await this.articleRepo.update(id, dto);
    const updated = await this.findOne(id);
    if (updated.docType) {
      // 文档文章：重切块 + 重向量化（同步，走单一事实源）
      await this.ingestionService?.ingestById(updated.id);
    } else {
      await this.embedForArticle(updated.id, updated.title, updated.content);
    }
    return updated;
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.articleRepo.delete(id);
    await this.removeEmbedding(id);
    await this.removeChunks(id);
  }

  /** 删除 chunks（失败静默；postgres FK 级联兜底，sqlite 显式清理） */
  private async removeChunks(id: number): Promise<void> {
    const dbType = (this.dataSource.options as any).type;
    if (dbType !== 'postgres') return;
    try {
      await this.dataSource.query(
        `DELETE FROM "ai_knowledge_chunks" WHERE "article_id" = $1`,
        [id],
      );
    } catch (err) {
      this.logger.warn(`[RAG] chunks delete failed article=${id}: ${(err as Error).message}`);
    }
  }

  // --- 向量检索（降级链） ---

  private isVectorAvailable(): boolean {
    if (!this.embeddingsService) return false;
    const dbType = (this.dataSource.options as any).type;
    return this.embeddingsService.isAvailable(dbType);
  }

  private async vectorSearch(query: string, limit: number): Promise<KnowledgeArticle[]> {
    const embeddings = this.embeddingsService!;
    const vector = await embeddings.embed(query);
    const vectorLiteral = `[${vector.join(',')}]`;

    // 取每文章最佳 chunk 需多取一些行，JS 合并去重
    const chunkK = Math.max(limit * 3, 10);

    const [chunkRows, embedRows] = await Promise.all([
      this.dataSource.query(
        `SELECT c.article_id AS "id", a.title, c.content, a.category, a."createdAt", a."updatedAt",
                (c.embedding <-> $1::vector) AS "distance"
         FROM "ai_knowledge_chunks" c
         JOIN "ai_knowledge_articles" a ON a.id = c.article_id
         WHERE c.embedding IS NOT NULL
         ORDER BY c.embedding <-> $1::vector
         LIMIT $2`,
        [vectorLiteral, chunkK],
      ),
      this.dataSource.query(
        `SELECT a.id, a.title, a.content, a.category, a."createdAt", a."updatedAt",
                (e.embedding <-> $1::vector) AS "distance"
         FROM "ai_knowledge_embeddings" e
         JOIN "ai_knowledge_articles" a ON a.id = e.article_id
         ORDER BY e.embedding <-> $1::vector
         LIMIT $2`,
        [vectorLiteral, limit],
      ),
    ]) as [any[], any[]];

    // 合并：每 article 保留 distance 最小的一行（chunk 内容即该最佳 chunk 片段）
    const byArticle = new Map<number, any>();
    for (const r of [...chunkRows, ...embedRows]) {
      const existing = byArticle.get(r.id);
      if (!existing || (r.distance ?? Infinity) < (existing.distance ?? Infinity)) {
        byArticle.set(r.id, r);
      }
    }

    return Array.from(byArticle.values())
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        category: r.category,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      }));
  }

  /** 写入向量（失败静默，不阻断业务） */
  private async embedForArticle(id: number, title: string, content: string): Promise<void> {
    if (!this.isVectorAvailable()) return;
    const embeddings = this.embeddingsService!;
    const model = this.configService?.get<string>('EMBEDDING_MODEL', 'text-embedding-3-small') ?? 'text-embedding-3-small';
    try {
      const vector = await embeddings.embed(`${title}\n${content}`);
      await this.dataSource.query(
        `INSERT INTO "ai_knowledge_embeddings" ("article_id", "embedding", "model")
         VALUES ($1, $2::vector, $3)
         ON CONFLICT ("article_id") DO UPDATE SET "embedding" = EXCLUDED."embedding", "model" = EXCLUDED."model"`,
        [id, `[${vector.join(',')}]`, model],
      );
    } catch (err) {
      this.logger.warn(`[RAG] embedding write failed article=${id}: ${(err as Error).message}`);
    }
  }

  /** 删除向量（失败静默） */
  private async removeEmbedding(id: number): Promise<void> {
    if (!this.isVectorAvailable()) return;
    try {
      await this.dataSource.query(
        `DELETE FROM "ai_knowledge_embeddings" WHERE "article_id" = $1`,
        [id],
      );
    } catch (err) {
      this.logger.warn(`[RAG] embedding delete failed article=${id}: ${(err as Error).message}`);
    }
  }

  /** 全文搜索兜底 */
  private async fullTextSearch(query: string, limit: number): Promise<KnowledgeArticle[]> {
    return this.articleRepo.find({
      where: [
        { title: Like(`%${query}%`) },
        { content: Like(`%${query}%`) },
        { category: Like(`%${query}%`) },
      ],
      order: { updatedAt: 'DESC' },
      take: limit,
    });
  }
}
