// SPDX-License-Identifier: Apache-2.0

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
import { UploadSignService } from '../../upload/upload-sign.service';
import { withSpan } from '../../common/tracing/tracer';
import { paginated } from '../../common/dto/paginated';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectRepository(KnowledgeArticle)
    private readonly articleRepo: Repository<KnowledgeArticle>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    // Required (not @Optional): the read side must re-sign, so a container without it should fail loudly
    // at wiring time rather than silently hand back an un-signable bare reference.
    // 必需（非 @Optional）：读侧必须重签，缺了它就该在装配期报错，而不是静默返回裸引用。
    private readonly uploadSign: UploadSignService,
    @Optional()
    private readonly embeddingsService?: EmbeddingsService,
    private readonly configService?: ConfigService,
    @Optional()
    @Inject(STORAGE_SERVICE)
    private readonly storageService?: StorageService,
    @Optional()
    private readonly ingestionService?: KnowledgeIngestionService,
  ) {}

  /**
   * CR-21 stage C: the store keeps the bare `/uploads/<file>` reference (no query), so the signature
   * never freezes at upload time. Mint it here, on the way OUT, so every read hands the caller a freshly
   * signed URL that `UploadSignService.verify` accepts. Null-preserving: an article with no stored file
   * passes through untouched. Never write the signed value back — `storageService.delete` needs the bare
   * reference that is persisted.
   *
   * CR-21 stage C：库里存的是裸 `/uploads/<file>` 引用（无 query），故签名不会在上传时冻结。此处只在
   * **出**口现签，使每次读取交给调用方的都是 `UploadSignService.verify` 认得的、新鲜的签名 URL。保留空值：
   * 无 fileUrl 的条目原样返回。签名值绝不回写 —— `storageService.delete` 依赖库中那份裸引用。
   */
  private signFileUrl(article: KnowledgeArticle): KnowledgeArticle {
    if (!article.fileUrl) return article;
    return { ...article, fileUrl: this.uploadSign.signUrl(article.fileUrl) };
  }

  async create(dto: CreateKnowledgeDto): Promise<KnowledgeArticle> {
    const article = this.articleRepo.create(dto);
    const saved = await this.articleRepo.save(article);
    await this.embedForArticle(saved.id, saved.title, saved.content);
    return this.signFileUrl(saved);
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

      return { ...this.signFileUrl(saved), queued };
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
    return this.signFileUrl(article);
  }

  async findAll(options: {
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: KnowledgeArticle[]; total: number }> {
    // Clamped on the same footing as the shared PaginationDto (cap 100): the DTO's @Max is the first
    // line of defence, this is the second, so even a caller that is not a validated controller cannot
    // pull the whole table.
    // 与共享 PaginationDto 同口径钳制（上限 100）：DTO 的 @Max 是第一道，这里是第二道 ——
    // 即便调用方不经过校验过的 controller，也拉不走整张表。
    const page = Math.max(options.page ?? 1, 1);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
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
    return paginated(items.map((a) => this.signFileUrl(a)), total, page, limit);
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
    return this.signFileUrl(updated);
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

  /**
   * AI-16 文档切块预览：返回文章的分块列表（postgres 从 chunks 表读；sqlite 实时切）。
   */
  async getChunks(id: number) {
    const article = await this.findOne(id);
    const dbType = (this.dataSource.options as any).type;

    if (dbType === 'postgres') {
      try {
        const rows: Array<{ chunk_index: number; content: string }> =
          await this.dataSource.query(
            `SELECT "chunk_index", "content" FROM "ai_knowledge_chunks"
             WHERE "article_id" = $1 ORDER BY "chunk_index"`,
            [id],
          );
        return { articleId: id, chunks: rows };
      } catch (err) {
        this.logger.warn(`[RAG] chunks read failed article=${id}: ${(err as Error).message}`);
      }
    }

    // sqlite / 无 chunks → 用同一切块逻辑实时生成预览
    const chunks = chunkText(article.content);
    return {
      articleId: id,
      chunks: chunks.map((content, i) => ({ chunk_index: i, content })),
    };
  }

  /**
   * AI-16 检索命中调试：返回 query 的检索结果 + 分数（向量 distance 或全文无分标记）。
   */
  async debugSearch(query: string, limit = 5) {
    const keyword = query.trim();
    if (!keyword) return { query: '', engine: 'none', hits: [] };

    if (this.isVectorAvailable()) {
      try {
        const embeddings = this.embeddingsService!;
        const vector = await embeddings.embed(keyword);
        const vectorLiteral = `[${vector.join(',')}]`;
        const rows = (await this.dataSource.query(
          `SELECT a.id, a.title, a.category, c.content,
                  (c.embedding <-> $1::vector) AS "distance"
           FROM "ai_knowledge_chunks" c
           JOIN "ai_knowledge_articles" a ON a.id = c.article_id
           WHERE c.embedding IS NOT NULL
           ORDER BY c.embedding <-> $1::vector
           LIMIT $2`,
          [vectorLiteral, limit],
        )) as Array<Record<string, unknown>>;
        return {
          query: keyword,
          engine: 'vector',
          hits: rows.map((r) => ({
            id: r.id,
            title: r.title,
            category: r.category,
            content: String(r.content).slice(0, 200),
            score: Number(r.distance).toFixed(4),
          })),
        };
      } catch (err) {
        this.logger.warn(`[RAG] debug vector search failed: ${(err as Error).message}`);
      }
    }

    const hits = await this.fullTextSearch(keyword, limit);
    return {
      query: keyword,
      engine: 'fulltext',
      hits: hits.map((a) => ({
        id: a.id,
        title: a.title,
        category: a.category,
        content: a.content.slice(0, 200),
        score: null,
      })),
    };
  }

  /**
   * AI-16 向量库统计：条目数 / 切块数 / 存储量（postgres 才有 chunks）。
   */
  async getStats() {
    const [articles, total] = await this.articleRepo.findAndCount();
    const dbType = (this.dataSource.options as any).type;
    let chunks = 0;
    let storageBytes: number | null = null;

    if (dbType === 'postgres') {
      try {
        const chunkRow = (await this.dataSource.query(
          `SELECT COUNT(*)::int AS count FROM "ai_knowledge_chunks"`,
        )) as Array<{ count: number }>;
        chunks = chunkRow[0]?.count ?? 0;
      } catch {
        // 表可能不存在
      }
      try {
        const sizeRow = (await this.dataSource.query(
          `SELECT pg_database_size(current_database())::bigint AS bytes`,
        )) as Array<{ bytes: number }>;
        storageBytes = sizeRow[0]?.bytes ?? null;
      } catch {
        // ignore
      }
    }

    return {
      articles: total,
      chunks,
      storageBytes,
      vectorEnabled: this.isVectorAvailable(),
    };
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
        `SELECT c.article_id AS "id", a.title, c.content, a.category, a."sourceFile", a."fileUrl",
                a."docType", a."chunkCount", a."createdAt", a."updatedAt",
                (c.embedding <-> $1::vector) AS "distance"
         FROM "ai_knowledge_chunks" c
         JOIN "ai_knowledge_articles" a ON a.id = c.article_id
         WHERE c.embedding IS NOT NULL
         ORDER BY c.embedding <-> $1::vector
         LIMIT $2`,
        [vectorLiteral, chunkK],
      ),
      this.dataSource.query(
        `SELECT a.id, a.title, a.content, a.category, a."sourceFile", a."fileUrl",
                a."docType", a."chunkCount", a."createdAt", a."updatedAt",
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
      // 字段与全文路径同口径（整份实体的列，不只检索相关的那几列）；fileUrl 库里是裸引用，
      // 出口现签（signFileUrl 复制对象，不回写）。
      // Same field set as the full-text path (the entity's columns, not just the search-relevant ones);
      // fileUrl is bare in the store and signed on the way out (signFileUrl copies, so no write-back).
      .map((r) =>
        this.signFileUrl({
          id: r.id,
          title: r.title,
          content: r.content,
          category: r.category,
          sourceFile: r.sourceFile,
          fileUrl: r.fileUrl,
          docType: r.docType,
          chunkCount: r.chunkCount,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        }),
      );
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
    const rows = await this.articleRepo.find({
      where: [
        { title: Like(`%${query}%`) },
        { content: Like(`%${query}%`) },
        { category: Like(`%${query}%`) },
      ],
      order: { updatedAt: 'DESC' },
      take: limit,
    });
    // 该路径返回的是库中实体（带裸 fileUrl），与向量路径一样出库即重签。
    // This path returns stored entities (carrying the bare fileUrl); sign on the way out, as the vector path.
    return rows.map((a) => this.signFileUrl(a));
  }
}
