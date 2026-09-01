// SPDX-License-Identifier: Apache-2.0

import { ConversationCompactor } from './conversation-compactor';
import { ConversationData } from './conversation.service';

function makeConv(overrides: Partial<ConversationData> = {}): ConversationData {
  return {
    id: 'conv-1',
    userId: '1',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    messages: [],
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ...overrides,
  };
}

/** 生成 n 轮 user/assistant 对话消息 */
function makeMessages(n: number): ConversationData['messages'] {
  const msgs: ConversationData['messages'] = [];
  for (let i = 0; i < n; i++) {
    msgs.push({ role: 'user', content: `问题${i}`, timestamp: '2026-08-01T00:00:00Z' });
    msgs.push({
      role: 'assistant',
      content: `回答${i}`,
      timestamp: '2026-08-01T00:00:01Z',
    });
  }
  return msgs;
}

describe('ConversationCompactor', () => {
  let mockProviderFactory: any;
  let mockProvider: any;
  let mockConversationService: any;
  let compactor: ConversationCompactor;

  const config = {
    defaultProvider: 'deepseek',
    defaultModel: 'deepseek-v4-flash',
    systemPrompt: 'sys',
  };

  beforeEach(() => {
    mockProvider = {
      generate: jest.fn().mockResolvedValue({ content: '这是一段摘要。' }),
    };
    mockProviderFactory = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
    };
    mockConversationService = {
      getMessagesForCompaction: jest.fn(),
      applyCompaction: jest.fn().mockResolvedValue(undefined),
      peekConversation: jest.fn(),
    };
    compactor = new ConversationCompactor(
      mockProviderFactory as any,
      config as any,
      mockConversationService as any,
    );
  });

  describe('ensureCompacted', () => {
    it('should NOT compact when message count <= threshold', async () => {
      const conv = makeConv({ messages: makeMessages(10) }); // 20 messages
      const result = await compactor.ensureCompacted(conv);

      expect(result).toBe(conv);
      expect(mockProvider.generate).not.toHaveBeenCalled();
      expect(mockConversationService.applyCompaction).not.toHaveBeenCalled();
    });

    it('should compact when message count > threshold', async () => {
      const messages = makeMessages(25); // 50 messages > 40
      const conv = makeConv({ messages });
      mockConversationService.getMessagesForCompaction.mockResolvedValue(
        messages.map((m, i) => ({ id: i + 1, ...m })),
      );

      const result = await compactor.ensureCompacted(conv);

      expect(mockProvider.generate).toHaveBeenCalledTimes(1);
      // 摘要 prompt 是中文
      const prompt = mockProvider.generate.mock.calls[0][0] as any;
      expect(prompt.messages[0].content).toContain('对话压缩');
      // applyCompaction 收到摘要 + 删除 id（只删被摘要的部分，保留最近窗口）
      expect(mockConversationService.applyCompaction).toHaveBeenCalledWith(
        'conv-1',
        '这是一段摘要。',
        expect.any(Array),
      );
      // 返回消息 = 最近 KEEP_RECENT(12) 条
      expect(result.summary).toBe('这是一段摘要。');
      expect(result.messages.length).toBe(12);
    });

    it('should NOT delete anything when generate rejects', async () => {
      mockProvider.generate.mockRejectedValue(new Error('LLM down'));
      const conv = makeConv({ messages: makeMessages(25) });

      const result = await compactor.ensureCompacted(conv);

      expect(result).toBe(conv);
      expect(mockConversationService.applyCompaction).not.toHaveBeenCalled();
      expect(mockConversationService.getMessagesForCompaction).not.toHaveBeenCalled();
    });

    it('should treat empty summary as failure (no persist)', async () => {
      mockProvider.generate.mockResolvedValue({ content: '   ' });
      const conv = makeConv({ messages: makeMessages(25) });

      const result = await compactor.ensureCompacted(conv);

      expect(result).toBe(conv);
      expect(mockConversationService.applyCompaction).not.toHaveBeenCalled();
    });

    it('should fold prior summary into the prompt when one exists', async () => {
      mockProvider.generate.mockResolvedValue({ content: '新摘要' });
      const conv = makeConv({
        summary: '旧摘要内容',
        messages: makeMessages(25),
      });

      await compactor.ensureCompacted(conv);

      const prompt = mockProvider.generate.mock.calls[0][0] as any;
      const userMsg = prompt.messages.find((m: any) => m.role === 'user');
      expect(userMsg.content).toContain('已有摘要');
      expect(userMsg.content).toContain('旧摘要内容');
    });

    it('should only call generate once for concurrent calls on the same conversation', async () => {
      const conv = makeConv({ messages: makeMessages(25) });
      mockConversationService.getMessagesForCompaction.mockResolvedValue([]);
      mockConversationService.peekConversation.mockResolvedValue(conv);

      await Promise.all([
        compactor.ensureCompacted(conv),
        compactor.ensureCompacted(conv),
      ]);

      expect(mockProvider.generate).toHaveBeenCalledTimes(1);
    });

    it('should fall back to defaultProvider when conversation provider is gone', async () => {
      mockProviderFactory.getProvider.mockImplementation((name: string) => {
        if (name === 'old-provider') throw new Error('not found');
        return mockProvider;
      });
      const conv = makeConv({
        provider: 'old-provider',
        messages: makeMessages(25),
      });
      mockConversationService.getMessagesForCompaction.mockResolvedValue([]);

      const result = await compactor.ensureCompacted(conv);
      expect(result.summary).toBe('这是一段摘要。');
    });
  });
});
