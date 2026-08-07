import { MemoriesService } from './memory.service';

describe('MemoriesService', () => {
  let service: MemoriesService;
  let mockRepo: any;
  let store: Map<number, any>;
  let idCounter: number;

  beforeEach(() => {
    store = new Map();
    idCounter = 1;

    mockRepo = {
      findOne: jest.fn(async ({ where }: any) => {
        for (const m of store.values()) {
          if (m.userId === where.userId && m.content === where.content) return m;
        }
        return null;
      }),
      count: jest.fn(async ({ where }: any) => {
        return Array.from(store.values()).filter((m) => m.userId === where.userId).length;
      }),
      create: jest.fn((data: any) => ({ id: idCounter, ...data })),
      save: jest.fn(async (data: any) => {
        const id = data.id ?? idCounter;
        idCounter += 1;
        const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        store.set(id, record);
        return record;
      }),
      find: jest.fn(async ({ where, order, take }: any) => {
        let rows = Array.from(store.values()).filter((m) => m.userId === where.userId);
        const sortKey = Object.keys(order ?? {})[0];
        if (sortKey) {
          rows = rows.sort((a, b) =>
            (a[sortKey]?.getTime?.() ?? 0) < (b[sortKey]?.getTime?.() ?? 0) ? 1 : -1,
          );
        }
        if (take) rows = rows.slice(0, take);
        return rows;
      }),
      update: jest.fn(async (criteria: any, data: any) => {
        for (const m of store.values()) {
          if (m.userId === criteria.userId) {
            m.lastUsedAt = data.lastUsedAt;
          }
        }
        return { affected: 1 };
      }),
      delete: jest.fn(async (criteria: any) => {
        let affected = 0;
        if (criteria.userId) {
          for (const [k, v] of store) {
            if (v.userId === criteria.userId) {
              store.delete(k);
              affected += 1;
            }
          }
        } else if (criteria.expiresAt?.value) {
          // typeorm LessThan() 包装在 FindOperator.value
          const cutoff = criteria.expiresAt.value;
          for (const [k, v] of store) {
            if (v.expiresAt && v.expiresAt < cutoff) {
              store.delete(k);
              affected += 1;
            }
          }
        }
        return { affected };
      }),
      remove: jest.fn(async (entity: any) => {
        store.delete(entity.id);
        return entity;
      }),
    };

    service = new MemoriesService(mockRepo);
  });

  describe('extractFromTurn', () => {
    it('should extract identity from 叫我', async () => {
      await service.extractFromTurn('1', '以后叫我阿杰吧');
      expect(store.size).toBe(1);
      const mem = Array.from(store.values())[0];
      expect(mem.type).toBe('identity');
      expect(mem.content).toBe('用户称呼：阿杰');
    });

    it('should extract preference from 我喜欢', async () => {
      await service.extractFromTurn('1', '我喜欢打羽毛球');
      const mem = Array.from(store.values())[0];
      expect(mem.type).toBe('preference');
      expect(mem.content).toBe('用户喜欢：打羽毛球');
    });

    it('should extract fact from 我的生日', async () => {
      await service.extractFromTurn('1', '我的生日是8月15日');
      const mem = Array.from(store.values())[0];
      expect(mem.type).toBe('fact');
      expect(mem.content).toContain('用户生日');
    });

    it('should extract nothing from an unrelated message', async () => {
      await service.extractFromTurn('1', '帮我查一下这个月的事件');
      expect(store.size).toBe(0);
    });

    it('should extract multiple memories from one message', async () => {
      await service.extractFromTurn('1', '叫我小美，我喜欢画画');
      expect(store.size).toBe(2);
    });
  });

  describe('create dedupe', () => {
    it('should not insert duplicate content for the same user', async () => {
      await service.create('1', 'preference', '用户喜欢：咖啡');
      await service.create('1', 'preference', '用户喜欢：咖啡');
      expect(store.size).toBe(1);
    });

    it('should allow the same content for different users', async () => {
      await service.create('1', 'preference', '用户喜欢：咖啡');
      await service.create('2', 'preference', '用户喜欢：咖啡');
      expect(store.size).toBe(2);
    });
  });

  describe('getForUser', () => {
    it('should return memories ordered by lastUsedAt', async () => {
      await service.create('1', 'fact', '旧记忆');
      const first = Array.from(store.values())[0];
      first.lastUsedAt = new Date(Date.now() - 1000);
      await service.create('1', 'fact', '新记忆');
      const second = Array.from(store.values())[1];
      second.lastUsedAt = new Date();

      const result = await service.getForUser('1', 8);
      expect(result.map((m) => m.content)).toEqual(['新记忆', '旧记忆']);
    });

    it('should exclude expired memories', async () => {
      await service.create('1', 'fact', '已过期');
      Array.from(store.values())[0].expiresAt = new Date(Date.now() - 1000);
      await service.create('1', 'fact', '有效');

      const result = await service.getForUser('1', 8);
      expect(result.map((m) => m.content)).toEqual(['有效']);
    });

    it('should respect the limit', async () => {
      await service.create('1', 'fact', 'A');
      await service.create('1', 'fact', 'B');
      await service.create('1', 'fact', 'C');

      const result = await service.getForUser('1', 2);
      expect(result).toHaveLength(2);
    });
  });

  describe('markUsed / deleteAllForUser / pruneExpired', () => {
    it('should update lastUsedAt for given contents', async () => {
      await service.create('1', 'fact', 'A');
      await service.markUsed('1', ['A']);
      const mem = Array.from(store.values())[0];
      expect(mem.lastUsedAt).toBeInstanceOf(Date);
    });

    it('should not fail on empty contents', async () => {
      await expect(service.markUsed('1', [])).resolves.toBeUndefined();
    });

    it('should delete all memories for a user', async () => {
      await service.create('1', 'fact', 'A');
      await service.create('1', 'fact', 'B');
      await service.deleteAllForUser('1');
      expect(store.size).toBe(0);
    });

    it('should delete expired memories', async () => {
      await service.create('1', 'fact', '过期1');
      Array.from(store.values())[0].expiresAt = new Date(Date.now() - 1000);
      await service.create('1', 'fact', '过期2');
      Array.from(store.values())[1].expiresAt = new Date(Date.now() - 1000);
      await service.create('1', 'fact', '有效');

      const deleted = await service.pruneExpired();
      expect(deleted).toBe(2);
      expect(store.size).toBe(1);
    });
  });
});
