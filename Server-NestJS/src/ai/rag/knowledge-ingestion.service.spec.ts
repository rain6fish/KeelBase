import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { KnowledgeArticle } from './knowledge-article.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { KnowledgeIngestionService } from './knowledge-ingestion.service';

describe('KnowledgeIngestionService', () => {
  let service: KnowledgeIngestionService;
  let repo: any;
  let dataSource: any;
  let embeddings: any;
  let queue: any;
  let config: any;

  const article = {
    id: 7,
    title: '手册',
    content: '第一段内容。\n第二段内容。\n'.repeat(200), // 会切成多块
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const setup = async (overrides: {
    dbType?: string;
    vectorAvailable?: boolean;
    queueEnabled?: boolean;
    queuePresent?: boolean;
  } = {}) => {
    const {
      dbType = 'sqlite',
      vectorAvailable = false,
      queueEnabled = true,
      queuePresent = true,
    } = overrides;

    repo = {
      findOneBy: jest.fn().mockResolvedValue(article),
      update: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      options: { type: dbType },
      query: jest.fn().mockResolvedValue(undefined),
    };
    embeddings = {
      isAvailable: jest.fn().mockReturnValue(vectorAvailable),
      embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };
    config = {
      get: jest.fn((key: string, def?: string) => {
        if (key === 'QUEUE_ENABLED') return queueEnabled;
        if (key === 'EMBEDDING_MODEL') return 'text-embedding-3-small';
        return def;
      }),
    };
    queue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeIngestionService,
        { provide: getRepositoryToken(KnowledgeArticle), useValue: repo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: EmbeddingsService, useValue: embeddings },
        { provide: ConfigService, useValue: config },
        {
          provide: getQueueToken('knowledge'),
          useValue: queuePresent ? queue : null,
        },
      ],
    }).compile();

    service = module.get<KnowledgeIngestionService>(KnowledgeIngestionService);
  };

  describe('enqueue', () => {
    it('should add a job and return true when queue enabled', async () => {
      await setup({ queueEnabled: true, queuePresent: true });
      const queued = await service.enqueue(7);
      expect(queue.add).toHaveBeenCalledWith(
        'ingest',
        { articleId: 7 },
        expect.any(Object),
      );
      expect(queued).toBe(true);
    });

    it('should run sync when QUEUE_ENABLED=false', async () => {
      await setup({ queueEnabled: false });
      const queued = await service.enqueue(7);
      expect(queue.add).not.toHaveBeenCalled();
      expect(queued).toBe(false);
      expect(repo.update).toHaveBeenCalled();
    });

    it('should run sync when queue is null', async () => {
      await setup({ queuePresent: false });
      const queued = await service.enqueue(7);
      expect(queued).toBe(false);
      expect(repo.update).toHaveBeenCalled();
    });

    it('should fall back to sync when queue.add throws', async () => {
      await setup({ queueEnabled: true, queuePresent: true });
      queue.add.mockRejectedValue(new Error('redis down'));
      const queued = await service.enqueue(7);
      expect(queued).toBe(false);
      expect(repo.update).toHaveBeenCalled();
    });
  });

  describe('ingestArticle', () => {
    it('should NOT persist chunks on sqlite, just update chunkCount', async () => {
      await setup({ dbType: 'sqlite' });
      const count = await service.ingestArticle(article as KnowledgeArticle);
      expect(count).toBeGreaterThan(1);
      expect(repo.update).toHaveBeenCalledWith(7, { chunkCount: count });
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('should upsert chunks with embeddings on postgres when vector available', async () => {
      await setup({ dbType: 'postgres', vectorAvailable: true });
      const count = await service.ingestArticle(article as KnowledgeArticle);
      expect(count).toBeGreaterThan(1);
      // wipe + N upserts
      const queries = dataSource.query.mock.calls;
      expect(queries[0][0]).toContain('DELETE FROM "ai_knowledge_chunks"');
      const inserts = queries.slice(1).filter((q: any) => q[0].includes('INSERT INTO'));
      expect(inserts.length).toBe(count);
      // 每行带 embedding 向量
      for (const [, params] of inserts) {
        expect(params[3]).toContain('[');
        expect(params[4]).toBe('text-embedding-3-small');
      }
      expect(repo.update).toHaveBeenCalledWith(7, { chunkCount: count });
    });

    it('should degrade to text-only chunks when embed throws', async () => {
      await setup({ dbType: 'postgres', vectorAvailable: true });
      embeddings.embed.mockRejectedValue(new Error('embed down'));
      const count = await service.ingestArticle(article as KnowledgeArticle);
      const inserts = dataSource.query.mock.calls
        .slice(1)
        .filter((q: any) => q[0].includes('INSERT INTO'));
      // 整篇降级：无 embedding
      for (const [, params] of inserts) {
        expect(params[3]).toBeNull();
      }
      expect(count).toBe(inserts.length);
    });

    it('should be idempotent (wipe before insert)', async () => {
      await setup({ dbType: 'postgres', vectorAvailable: false });
      await service.ingestArticle(article as KnowledgeArticle);
      const firstWipes = dataSource.query.mock.calls.filter((q: any) =>
        q[0].includes('DELETE FROM'),
      ).length;
      await service.ingestArticle(article as KnowledgeArticle);
      const totalWipes = dataSource.query.mock.calls.filter((q: any) =>
        q[0].includes('DELETE FROM'),
      ).length;
      expect(totalWipes).toBe(firstWipes + 1);
    });
  });

  describe('ingestById', () => {
    it('should no-op when article is missing', async () => {
      await setup();
      repo.findOneBy.mockResolvedValue(null);
      const result = await service.ingestById(999);
      expect(result).toBeNull();
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });
});
