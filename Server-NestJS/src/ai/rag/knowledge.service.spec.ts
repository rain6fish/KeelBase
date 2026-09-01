// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeArticle } from './knowledge-article.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { KnowledgeIngestionService } from './knowledge-ingestion.service';
import { STORAGE_SERVICE } from '../../storage/storage.service';
import { detectDocType, parseDocument, MAX_DOC_CHARS } from './document-parser';

jest.mock('./document-parser', () => ({
  detectDocType: jest.fn(),
  parseDocument: jest.fn(),
  MAX_DOC_CHARS: 800_000,
  KNOWLEDGE_DOC_MIMES: [],
  MAX_KNOWLEDGE_FILE_SIZE: 10 * 1024 * 1024,
}));

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let repo: any;
  let dataSource: any;
  let embeddings: any;

  const article: KnowledgeArticle = {
    id: 1,
    title: '休假政策',
    content: '员工每年可享受 5 天年假',
    category: '人力资源',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let storageService = {
    save: jest.fn().mockResolvedValue('/uploads/doc.pdf'),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  let ingestionService = {
    enqueue: jest.fn().mockResolvedValue(true),
    ingestById: jest.fn().mockResolvedValue(3),
  };

  const setup = async (embeddingsOverrides: Partial<typeof embeddings> = {}) => {
    // 每用例重建共享 mock：避免 mockRejectedValueOnce 等一次性实现跨用例泄漏
    storageService = {
      save: jest.fn().mockResolvedValue('/uploads/doc.pdf'),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    ingestionService = {
      enqueue: jest.fn().mockResolvedValue(true),
      ingestById: jest.fn().mockResolvedValue(3),
    };
    repo = {
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve({ ...d, id: 1 })),
      findOneBy: jest.fn(),
      findAndCount: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    dataSource = {
      options: { type: 'sqlite' },
      query: jest.fn().mockResolvedValue([]),
    };
    embeddings = {
      isAvailable: jest.fn(),
      embed: jest.fn(),
      ...embeddingsOverrides,
    };
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeService,
        { provide: getRepositoryToken(KnowledgeArticle), useValue: repo },
        { provide: DataSource, useValue: dataSource },
        { provide: EmbeddingsService, useValue: embeddings },
        { provide: STORAGE_SERVICE, useValue: storageService },
        { provide: KnowledgeIngestionService, useValue: ingestionService },
        ConfigService,
      ],
    }).compile();

    service = module.get<KnowledgeService>(KnowledgeService);
  };

  describe('create', () => {
    it('creates and saves an article', async () => {
      await setup();
      const result = await service.create({
        title: '休假政策',
        content: '员工每年可享受 5 天年假',
        category: '人力资源',
      });
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    it('embeds article when vector available', async () => {
      await setup({
        isAvailable: jest.fn().mockReturnValue(true),
        embed: jest.fn().mockResolvedValue([0.1, 0.2]),
      });
      await service.create({ title: '休假政策', content: '员工每年可享受 5 天年假' });
      expect(embeddings.embed).toHaveBeenCalledWith(expect.stringContaining('休假政策'));
      expect(dataSource.query).toHaveBeenCalled();
    });

    it('skips embedding when vector unavailable', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(false) });
      await service.create({ title: '休假政策', content: '员工每年可享受 5 天年假' });
      expect(embeddings.embed).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns article when found', async () => {
      await setup();
      repo.findOneBy.mockResolvedValue(article);
      await expect(service.findOne(1)).resolves.toEqual(article);
    });

    it('throws NotFound when missing', async () => {
      await setup();
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow('知识条目不存在');
    });
  });

  describe('findAll', () => {
    it('paginates without query', async () => {
      await setup();
      repo.findAndCount.mockResolvedValue([[article], 1]);
      const result = await service.findAll({});
      expect(result.items).toEqual([article]);
      expect(result.total).toBe(1);
      expect(repo.findAndCount.mock.calls[0][0].skip).toBe(0);
      expect(repo.findAndCount.mock.calls[0][0].take).toBe(20);
    });

    it('builds LIKE conditions when q provided', async () => {
      await setup();
      repo.findAndCount.mockResolvedValue([[article], 1]);
      await service.findAll({ q: '年假', page: 2, limit: 10 });
      const args = repo.findAndCount.mock.calls[0][0];
      expect(args.where).toBeInstanceOf(Array);
      expect(args.where).toHaveLength(3);
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
    });
  });

  describe('search', () => {
    it('returns empty for blank query', async () => {
      await setup();
      await expect(service.search('   ')).resolves.toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('uses vector search when available', async () => {
      await setup({
        isAvailable: jest.fn().mockReturnValue(true),
        embed: jest.fn().mockResolvedValue([0.5, 0.5]),
      });
      dataSource.options = { type: 'postgres' };
      dataSource.query.mockResolvedValue([{ ...article, createdAt: article.createdAt.toISOString(), updatedAt: article.updatedAt.toISOString() }]);

      const result = await service.search('年假');

      expect(dataSource.query).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('falls back to full-text when vector search throws', async () => {
      await setup({
        isAvailable: jest.fn().mockReturnValue(true),
        embed: jest.fn().mockRejectedValue(new Error('embedding down')),
      });
      repo.find.mockResolvedValue([article]);

      const result = await service.search('年假');

      expect(repo.find).toHaveBeenCalled();
      expect(result).toEqual([article]);
    });

    it('uses full-text when vector unavailable', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(false) });
      repo.find.mockResolvedValue([article]);

      const result = await service.search('年假');

      expect(repo.find).toHaveBeenCalled();
      expect(result).toEqual([article]);
    });

    it('unions chunk rows and single-embedding rows, dedupes by article, sorts by distance', async () => {
      await setup({
        isAvailable: jest.fn().mockReturnValue(true),
        embed: jest.fn().mockResolvedValue([0.5, 0.5]),
      });
      dataSource.options = { type: 'postgres' };
      const chunkRow = { id: 1, title: '手册', content: '手册第 3 段', category: null, createdAt: '2026-01-01', updatedAt: '2026-01-01', distance: 0.1 };
      const embedRow = { id: 2, title: '政策', content: '年假政策内容', category: null, createdAt: '2026-01-01', updatedAt: '2026-01-01', distance: 0.3 };
      dataSource.query
        .mockResolvedValueOnce([chunkRow])   // chunk query
        .mockResolvedValueOnce([embedRow]);  // embed query

      const result = await service.search('年假');

      expect(dataSource.query).toHaveBeenCalledTimes(2);
      // chunk query 带 ai_knowledge_chunks
      expect(dataSource.query.mock.calls[0][0]).toContain('ai_knowledge_chunks');
      // 合并后按 distance 排序，chunk 在前
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    it('dedupes the same article appearing in both chunk and embed rows', async () => {
      await setup({
        isAvailable: jest.fn().mockReturnValue(true),
        embed: jest.fn().mockResolvedValue([0.5, 0.5]),
      });
      dataSource.options = { type: 'postgres' };
      const same = (distance: number) => ({ id: 1, title: '手册', content: 'x', category: null, createdAt: '2026-01-01', updatedAt: '2026-01-01', distance });
      dataSource.query
        .mockResolvedValueOnce([same(0.1)])   // chunk
        .mockResolvedValueOnce([same(0.9)]);  // embed

      const result = await service.search('年假', 5);

      expect(result).toHaveLength(1); // 去重，保留 distance 小的
    });
  });

  describe('createDocument', () => {
    beforeEach(() => {
      (detectDocType as jest.Mock).mockReturnValue('pdf');
      (parseDocument as jest.Mock).mockResolvedValue('PDF 解析文本内容');
      (detectDocType as jest.Mock).mockClear();
      (parseDocument as jest.Mock).mockClear();
    });

    it('creates a document article, saves the file, and enqueues ingestion', async () => {
      await setup();
      const result = await service.createDocument({
        buffer: Buffer.from('%PDF-1.4'),
        originalName: '手册.pdf',
        mimetype: 'application/pdf',
      });

      expect(detectDocType).toHaveBeenCalledWith('.pdf');
      expect(parseDocument).toHaveBeenCalled();
      expect(storageService.save).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '手册',
          docType: 'pdf',
          sourceFile: '手册.pdf',
          content: 'PDF 解析文本内容',
        }),
      );
      expect(ingestionService.enqueue).toHaveBeenCalledWith(1);
      expect(result.queued).toBe(true);
    });

    it('rejects unsupported file type', async () => {
      await setup();
      (detectDocType as jest.Mock).mockReturnValue(null);
      await expect(
        service.createDocument({
          buffer: Buffer.from('x'),
          originalName: 'x.txt',
          mimetype: 'text/plain',
        }),
      ).rejects.toThrow('不允许的文件类型');
    });

    it('rejects empty parsed text', async () => {
      await setup();
      (parseDocument as jest.Mock).mockResolvedValue('   ');
      await expect(
        service.createDocument({
          buffer: Buffer.from('%PDF'),
          originalName: '空.pdf',
          mimetype: 'application/pdf',
        }),
      ).rejects.toThrow('文档内容为空');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects oversized parsed text', async () => {
      await setup();
      (parseDocument as jest.Mock).mockResolvedValue('x'.repeat(MAX_DOC_CHARS + 1));
      await expect(
        service.createDocument({
          buffer: Buffer.from('%PDF'),
          originalName: '大.pdf',
          mimetype: 'application/pdf',
        }),
      ).rejects.toThrow('文档过大');
    });

    it('deletes the saved file when article save fails', async () => {
      await setup();
      repo.save.mockRejectedValue(new Error('db down'));
      await expect(
        service.createDocument({
          buffer: Buffer.from('%PDF'),
          originalName: '手册.pdf',
          mimetype: 'application/pdf',
        }),
      ).rejects.toThrow('db down');
      expect(storageService.delete).toHaveBeenCalledWith('/uploads/doc.pdf');
    });
  });

  describe('update', () => {
    it('updates an existing article', async () => {
      await setup();
      repo.findOneBy
        .mockResolvedValueOnce(article)
        .mockResolvedValueOnce({ ...article, title: '新标题' });
      repo.update.mockResolvedValue({ affected: 1 });

      const result = await service.update(1, { title: '新标题' });

      expect(repo.update).toHaveBeenCalledWith(1, { title: '新标题' });
      expect(result.title).toBe('新标题');
    });

    it('throws NotFound when article missing', async () => {
      await setup();
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.update(99, { title: 'x' })).rejects.toThrow('知识条目不存在');
    });
  });

  describe('remove', () => {
    it('deletes an existing article and its embedding', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(true) });
      repo.findOneBy.mockResolvedValue(article);

      await service.remove(1);

      expect(repo.delete).toHaveBeenCalledWith(1);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "ai_knowledge_embeddings"'),
        [1],
      );
    });

    it('throws NotFound when article missing', async () => {
      await setup();
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toThrow('知识条目不存在');
    });
  });

  describe('AI-16 知识库深化', () => {
    it('getChunks 在 sqlite 用 chunkText 实时切块', async () => {
      await setup();
      repo.findOneBy.mockResolvedValue({ ...article, content: '第一段。第二段。第三段。' });

      const result = await service.getChunks(1);

      expect(result.articleId).toBe(1);
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0]).toHaveProperty('content');
    });

    it('getChunks postgres 从 chunks 表读', async () => {
      await setup();
      dataSource.options = { type: 'postgres' };
      dataSource.query.mockResolvedValue([
        { chunk_index: 0, content: 'chunk0' },
        { chunk_index: 1, content: 'chunk1' },
      ]);
      repo.findOneBy.mockResolvedValue(article);

      const result = await service.getChunks(1);
      expect(result.chunks).toHaveLength(2);
      expect(result.chunks[0].content).toBe('chunk0');
    });

    it('debugSearch 无向量时走全文', async () => {
      await setup();
      repo.find.mockResolvedValue([article]);

      const result = await service.debugSearch('年假');

      expect(result.engine).toBe('fulltext');
      expect(result.hits[0].title).toBe('休假政策');
    });

    it('debugSearch 空 query 返回空', async () => {
      await setup();
      const result = await service.debugSearch('   ');
      expect(result.hits).toEqual([]);
    });

    it('getStats 返回条目数与向量状态', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(false) });
      repo.findAndCount.mockResolvedValue([[article], 1]);

      const stats = await service.getStats();

      expect(stats.articles).toBe(1);
      expect(stats.chunks).toBe(0);
      expect(stats.vectorEnabled).toBe(false);
    });
  });

  describe('补充覆盖：失败降级与分支', () => {
    const doc = { buffer: Buffer.from('%PDF'), originalName: '手册.pdf', mimetype: 'application/pdf' };

    it('createDocument 解析失败抛 400', async () => {
      await setup();
      (detectDocType as jest.Mock).mockReturnValue('pdf');
      (parseDocument as jest.Mock).mockRejectedValue(new Error('corrupt'));
      await expect(service.createDocument(doc)).rejects.toThrow('文档解析失败');
    });

    it('createDocument 存文件失败仅记日志不阻断', async () => {
      await setup();
      (detectDocType as jest.Mock).mockReturnValue('pdf');
      (parseDocument as jest.Mock).mockResolvedValue('内容');
      storageService.save.mockRejectedValueOnce(new Error('disk full'));
      const result = await service.createDocument(doc);
      expect(result.fileUrl).toBeUndefined();
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ fileUrl: undefined }));
    });

    it('update 文档文章走重切块重向量化（ingestById）', async () => {
      await setup();
      const docArticle = { ...article, docType: 'pdf' };
      repo.findOneBy.mockResolvedValueOnce(docArticle).mockResolvedValueOnce({ ...docArticle, title: '新' });
      repo.update.mockResolvedValue({ affected: 1 });
      await service.update(1, { title: '新' });
      expect(ingestionService.ingestById).toHaveBeenCalledWith(1);
    });

    it('update 普通文章走 embedForArticle', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(false) });
      repo.findOneBy.mockResolvedValueOnce(article).mockResolvedValueOnce({ ...article, title: '新' });
      repo.update.mockResolvedValue({ affected: 1 });
      await service.update(1, { title: '新' });
      expect(ingestionService.ingestById).not.toHaveBeenCalled();
      expect(embeddings.embed).not.toHaveBeenCalled();
    });

    it('remove 在 postgres 显式删 chunks', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(false) });
      dataSource.options = { type: 'postgres' };
      repo.findOneBy.mockResolvedValue(article);
      await service.remove(1);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "ai_knowledge_chunks"'),
        [1],
      );
    });

    it('remove 删 chunks 失败仅记日志', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(false) });
      dataSource.options = { type: 'postgres' };
      dataSource.query.mockRejectedValue(new Error('no table'));
      repo.findOneBy.mockResolvedValue(article);
      await expect(service.remove(1)).resolves.toBeUndefined();
    });

    it('getChunks postgres 查询失败回退实时切块', async () => {
      await setup();
      dataSource.options = { type: 'postgres' };
      dataSource.query.mockRejectedValue(new Error('no table'));
      repo.findOneBy.mockResolvedValue({ ...article, content: '第一段。第二段。' });
      const result = await service.getChunks(1);
      expect(result.chunks.length).toBeGreaterThan(0);
    });

    it('getStats postgres 查 chunks 计数与库大小', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(false) });
      dataSource.options = { type: 'postgres' };
      dataSource.query
        .mockResolvedValueOnce([{ count: 12 }])
        .mockResolvedValueOnce([{ bytes: 1048576 }]);
      repo.findAndCount.mockResolvedValue([[article], 1]);
      const stats = await service.getStats();
      expect(stats.chunks).toBe(12);
      expect(stats.storageBytes).toBe(1048576);
    });

    it('debugSearch 向量可用走 vector engine（含分数格式化）', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(true), embed: jest.fn().mockResolvedValue([0.1, 0.2]) });
      dataSource.options = { type: 'postgres' };
      dataSource.query.mockResolvedValue([{ id: 1, title: '手册', category: null, content: 'x', distance: 0.25 }]);
      const result = await service.debugSearch('年假');
      expect(result.engine).toBe('vector');
      expect(result.hits[0].score).toBe('0.2500');
    });

    it('debugSearch 向量失败回退全文', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(true), embed: jest.fn().mockRejectedValue(new Error('down')) });
      repo.find.mockResolvedValue([article]);
      const result = await service.debugSearch('年假');
      expect(result.engine).toBe('fulltext');
    });

    it('向量写入失败仅记日志（create 不阻断）', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(true), embed: jest.fn().mockResolvedValue([0.1]) });
      dataSource.query.mockRejectedValue(new Error('pg down'));
      const result = await service.create({ title: 'x', content: 'y' });
      expect(result.id).toBe(1);
    });

    it('向量删除失败仅记日志（remove 不阻断）', async () => {
      await setup({ isAvailable: jest.fn().mockReturnValue(true) });
      repo.findOneBy.mockResolvedValue(article);
      dataSource.query.mockRejectedValue(new Error('pg down'));
      await expect(service.remove(1)).resolves.toBeUndefined();
    });
  });
});
