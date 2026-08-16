import { ConversationService } from './conversation.service';

describe('ConversationService', () => {
  let service: ConversationService;
  let mockConvRepo: any;
  let mockMsgRepo: any;
  const mockUuid = 'conv-uuid';

  // CASL ability mock：allowed=true 时 cannot 返回 false（放行）
  const mockAbility = (allowed: boolean) => ({ cannot: () => !allowed }) as any;

  // In-memory store for mocking
  let convStore: Map<string, any>;
  let msgStore: Map<number, any>;
  let msgIdCounter: number;

  beforeEach(() => {
    convStore = new Map();
    msgStore = new Map();
    msgIdCounter = 1;

    mockConvRepo = {
      save: jest.fn((data) => {
        // Generate a unique id per save so conversations don't collide
        const id = convStore.size === 0 ? mockUuid : `conv-${convStore.size + 1}`;
        const record = { id, ...data, isDeleted: false, createdAt: new Date(), updatedAt: new Date() };
        convStore.set(id, record);
        return Promise.resolve(record);
      }),
      findOne: jest.fn(({ where }: any) => {
        const conv = convStore.get(where.id);
        if (!conv || conv.isDeleted) return Promise.resolve(null);
        return Promise.resolve(conv);
      }),
      find: jest.fn(({ where }: any) => {
        const userId = where?.userId;
        return Promise.resolve(
          Array.from(convStore.values()).filter((c) => c.userId === userId && !c.isDeleted),
        );
      }),
      update: jest.fn((criteria, data) => {
        // Support both id-string updates and criteria-object updates (deleteAllUserConversations)
        if (typeof criteria === 'string') {
          const conv = convStore.get(criteria);
          if (conv) Object.assign(conv, data);
        } else {
          for (const conv of convStore.values()) {
            if (conv.userId === criteria.userId && !conv.isDeleted) Object.assign(conv, data);
          }
        }
        return Promise.resolve({ affected: 1 });
      }),
      delete: jest.fn(({ conversationId }: any) => {
        for (const [k, v] of msgStore) {
          if (v.conversationId === conversationId) msgStore.delete(k);
        }
        return Promise.resolve({ affected: 1 });
      }),
      remove: jest.fn((entities) => {
        for (const e of entities) convStore.delete(e.id);
        return Promise.resolve(entities);
      }),
    };

    mockMsgRepo = {
      save: jest.fn((data) => {
        const id = msgIdCounter++;
        const record = { id, ...data, createdAt: new Date() };
        msgStore.set(id, record);
        return Promise.resolve(record);
      }),
      find: jest.fn(({ where, order, take }: any) => {
        let msgs = Array.from(msgStore.values()).filter(
          (m) => m.conversationId === where?.conversationId,
        );
        if (take) msgs = msgs.slice(0, take);
        // Remove system messages from the second findOne call result
        // Actually, just return all messages for the conversation ordered by createdAt
        msgs.sort((a: any, b: any) => a.createdAt - b.createdAt);
        return Promise.resolve(msgs);
      }),
      count: jest.fn(({ where }: any) => {
        const count = Array.from(msgStore.values()).filter(
          (m) => m.conversationId === where?.conversationId,
        ).length;
        return Promise.resolve(count);
      }),
      delete: jest.fn((criteria: any) => {
        let affected = 0;
        if (criteria?.id?.value) {
          // typeorm In() 包装在 FindOperator.value
          const ids = criteria.id.value as number[];
          for (const id of ids) {
            if (msgStore.delete(id)) affected += 1;
          }
        } else if (criteria?.conversationId) {
          for (const [k, v] of msgStore) {
            if (v.conversationId === criteria.conversationId) {
              msgStore.delete(k);
              affected += 1;
            }
          }
        }
        return Promise.resolve({ affected });
      }),
      remove: jest.fn((entities: any[]) => {
        for (const e of entities) msgStore.delete(e.id);
        return Promise.resolve(entities);
      }),
    };

    service = new ConversationService(mockConvRepo as any, mockMsgRepo as any, 3600);
  });

  describe('createConversation()', () => {
    it('should create a new conversation for a user', async () => {
      const conv = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');

      expect(conv).toBeDefined();
      expect(conv.id).toBeDefined();
      expect(conv.userId).toBe('user1');
      expect(conv.provider).toBe('deepseek');
      expect(conv.model).toBe('deepseek-v4-flash');
      expect(conv.messages).toEqual([]);
      expect(conv.createdAt).toBeDefined();
    });
  });

  describe('getConversation()', () => {
    it('should retrieve an existing conversation', async () => {
      const created = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      const retrieved = await service.getConversation(created.id, 'user1', mockAbility(true));

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
    });

    it('should throw when conversation does not exist', async () => {
      await expect(service.getConversation('nonexistent', 'user1', mockAbility(true))).rejects.toThrow(
        'Conversation not found',
      );
    });

    it('should throw when CASL forbids access (not owner)', async () => {
      const conv = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      await expect(service.getConversation(conv.id, 'user2', mockAbility(false))).rejects.toThrow();
    });
  });

  describe('appendMessage()', () => {
    it('should add a message to the conversation', async () => {
      const conv = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      await service.appendMessage(conv.id, { role: 'user', content: 'Hello' });
      const updated = await service.getConversation(conv.id, 'user1', mockAbility(true));

      expect(updated.messages).toHaveLength(1);
      expect(updated.messages[0].role).toBe('user');
      expect(updated.messages[0].content).toBe('Hello');
    });

    it('should NOT evict messages below the hard cap (compaction handles those)', async () => {
      const conv = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      // 41 条（> 旧 50 上限的一半？不，41 < 80）——旧实现会在 51 条触发，现硬帽 80 不触发
      for (let i = 0; i < 41; i++) {
        await service.appendMessage(conv.id, { role: 'user', content: `m${i}` });
      }
      const updated = await service.getConversation(conv.id, 'user1', mockAbility(true));
      expect(updated.messages).toHaveLength(41);
    });

    it('should evict oldest user message when exceeding the hard cap (80)', async () => {
      const conv = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      for (let i = 0; i < 85; i++) {
        await service.appendMessage(conv.id, { role: 'user', content: `m${i}` });
      }
      const updated = await service.getConversation(conv.id, 'user1', mockAbility(true));
      expect(updated.messages).toHaveLength(80);
      // 最旧被删除
      expect(updated.messages[0].content).toBe('m5');
    });
  });

  describe('applyCompaction()', () => {
    it('should persist summary, delete the ids, and recompute messageCount', async () => {
      const conv = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      for (let i = 0; i < 5; i++) {
        await service.appendMessage(conv.id, { role: 'user', content: `m${i}` });
      }
      const before = await service.getMessagesForCompaction(conv.id);
      const ids = before.slice(0, 3).map((m) => m.id);

      await service.applyCompaction(conv.id, '摘要内容', ids);

      const after = await service.getConversation(conv.id, 'user1', mockAbility(true));
      expect(after.summary).toBe('摘要内容');
      expect(after.messages).toHaveLength(2); // 5 - 3
      const convRow = convStore.get(conv.id);
      expect(convRow.messageCount).toBe(2);
    });

    it('should do nothing harmful when delete ids are already gone', async () => {
      const conv = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      await service.appendMessage(conv.id, { role: 'user', content: 'hi' });

      await service.applyCompaction(conv.id, '摘要', [9999, 10000]); // 不存在

      const after = await service.getConversation(conv.id, 'user1', mockAbility(true));
      expect(after.summary).toBe('摘要');
      expect(after.messages).toHaveLength(1);
    });
  });

  describe('deleteConversation()', () => {
    it('should soft-delete a conversation', async () => {
      const conv = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      await service.deleteConversation(conv.id, 'user1', mockAbility(true));

      await expect(service.getConversation(conv.id, 'user1', mockAbility(true))).rejects.toThrow(
        'Conversation not found',
      );
    });

    it('should throw when CASL forbids delete (not owner)', async () => {
      const conv = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      await expect(service.deleteConversation(conv.id, 'user2', mockAbility(false))).rejects.toThrow();
    });
  });

  describe('getUserConversations()', () => {
    it('should return conversations for a user', async () => {
      await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');

      const convs = await service.getUserConversations('user1');
      expect(convs).toHaveLength(2);
    });

    it('should not return other users conversations', async () => {
      await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      await service.createConversation('user2', 'deepseek', 'deepseek-v4-flash');

      expect((await service.getUserConversations('user1'))).toHaveLength(1);
      expect((await service.getUserConversations('user2'))).toHaveLength(1);
    });
  });

  describe('deleteAllUserConversations()', () => {
    it('should delete all conversations for a user', async () => {
      await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');

      await service.deleteAllUserConversations('user1');
      expect((await service.getUserConversations('user1'))).toEqual([]);
    });
  });

  describe('peekConversation()', () => {
    it('返回会话及其消息（含已软删过滤）', async () => {
      const created = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');
      await service.appendMessage(created.id, { role: 'user', content: 'hi' });

      const data = await service.peekConversation(created.id);
      expect(data.id).toBe(created.id);
      expect(data.messages.some((m: any) => m.content === 'hi')).toBe(true);
    });

    it('会话不存在抛 NotFound', async () => {
      await expect(service.peekConversation('nope')).rejects.toThrow('Conversation not found');
    });
  });

  describe('cleanupExpiredConversations()', () => {
    it('清理过期会话及其消息，保留未过期', async () => {
      // 覆盖 find 以支持 lastActivityAt 过滤（默认 mock 只按 userId）
      mockConvRepo.find.mockImplementation(({ where }: any) => {
        const cutoff = (where?.lastActivityAt as any)?.value;
        return Promise.resolve(
          Array.from(convStore.values()).filter(
            (c) => !c.isDeleted && cutoff && new Date(c.lastActivityAt).getTime() < cutoff.getTime(),
          ),
        );
      });
      // 直接塞一条过期会话（lastActivityAt 在 ttlMs 之前）+ 一条未过期
      convStore.set('expired-1', { id: 'expired-1', userId: 'user1', provider: 'deepseek', model: 'm', lastActivityAt: new Date(Date.now() - 7200 * 1000), isDeleted: false, createdAt: new Date(), updatedAt: new Date() });
      msgStore.set(1, { id: 1, conversationId: 'expired-1', role: 'user', content: 'x', createdAt: new Date() });
      const fresh = await service.createConversation('user1', 'deepseek', 'deepseek-v4-flash');

      await service.cleanupExpiredConversations();

      expect(convStore.has('expired-1')).toBe(false);
      expect(convStore.has(fresh.id)).toBe(true);
    });
  });
});
