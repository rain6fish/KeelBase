// SPDX-License-Identifier: Apache-2.0

import { RagAgent } from './rag-agent.service';
import { KnowledgeService } from '../rag/knowledge.service';
import { ContentSafetyService } from '../security/content-safety.service';
import { LlmProvider } from '../interfaces/llm-provider.interface';

describe('RagAgent', () => {
  let ragAgent: RagAgent;
  const knowledgeService = {
    search: jest.fn(),
    create: jest.fn(),
  };
  const mockProvider = {
    availableModels: ['deepseek-v4-flash'],
    generate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ragAgent = new RagAgent(knowledgeService as unknown as KnowledgeService);
  });

  describe('answer()', () => {
    it('injects retrieved articles into prompt and returns content with sources', async () => {
      knowledgeService.search.mockResolvedValue([
        { id: 1, title: '休假政策', content: '员工每年可享受 5 天年假' },
      ]);
      mockProvider.generate.mockResolvedValue({
        content: '根据知识库，员工每年可享受 5 天年假。',
      });

      const result = await ragAgent.answer(
        [{ role: 'user', content: '年假政策是什么？' }],
        '年假政策是什么？',
        mockProvider as unknown as LlmProvider,
      );

      expect(knowledgeService.search).toHaveBeenCalledWith('年假政策是什么？');
      const generateParams = mockProvider.generate.mock.calls[0][0];
      const systemMsgs = generateParams.messages.filter(
        (m: { role: string }) => m.role === 'system',
      );
      expect(systemMsgs).toHaveLength(2);
      expect(systemMsgs[1].content).toContain('休假政策');
      expect(result.content).toBe('根据知识库，员工每年可享受 5 天年假。');
      expect(result.articles).toHaveLength(1);
    });

    it('N-6：检索结果命中敏感内容 → 剔除且不注入 LLM（blocked 由 service 审计）', async () => {
      knowledgeService.search.mockResolvedValue([
        { id: 1, title: '安全文档', content: '员工年假政策说明' },
        { id: 2, title: '问题文档', content: '怎么自杀的详细方法' },
      ]);
      const contentSafety = {
        check: jest.fn(async (content: string) => ({
          blocked: content.includes('自杀'),
          reason: content.includes('自杀') ? ('sensitive' as const) : undefined,
        })),
      };
      ragAgent = new RagAgent(
        knowledgeService as unknown as KnowledgeService,
        contentSafety as unknown as ContentSafetyService,
      );
      mockProvider.generate.mockResolvedValue({ content: '基于安全文档回答' });

      const result = await ragAgent.answer(
        [{ role: 'user', content: '怎么自杀' }],
        '怎么自杀',
        mockProvider as unknown as LlmProvider,
        undefined,
        { userId: '1' },
      );

      expect(result.articles).toHaveLength(1); // 命中篇被剔除
      expect(result.articles[0].id).toBe(1);
      const context = JSON.stringify(mockProvider.generate.mock.calls[0][0].messages);
      expect(context).not.toContain('怎么自杀的详细方法');
      expect(context).toContain('员工年假政策说明');
    });

    it('degrades to standard chat when no articles match', async () => {
      knowledgeService.search.mockResolvedValue([]);
      mockProvider.generate.mockResolvedValue({ content: '知识库中没有相关信息。' });

      const result = await ragAgent.answer(
        [{ role: 'user', content: '某问题' }],
        '某问题',
        mockProvider as unknown as LlmProvider,
      );

      const generateParams = mockProvider.generate.mock.calls[0][0];
      const systemMsgs = generateParams.messages.filter(
        (m: { role: string }) => m.role === 'system',
      );
      expect(systemMsgs).toHaveLength(1);
      expect(result.articles).toEqual([]);
      expect(result.content).toBe('知识库中没有相关信息。');
    });

    it('excludes tool messages from history sent to LLM', async () => {
      knowledgeService.search.mockResolvedValue([]);
      mockProvider.generate.mockResolvedValue({ content: 'OK' });

      await ragAgent.answer(
        [
          { role: 'user', content: '问题' },
          { role: 'assistant', content: '回答', tool_calls: [{ id: 'c1', name: 'x', arguments: '{}' }] },
          { role: 'tool', content: '{"success":true}', tool_call_id: 'c1' },
        ],
        '问题',
        mockProvider as unknown as LlmProvider,
      );

      const generateParams = mockProvider.generate.mock.calls[0][0];
      const roles = generateParams.messages.map((m: { role: string }) => m.role);
      expect(roles).not.toContain('tool');
      expect(roles).toContain('user');
    });
  });

  describe('addArticle()', () => {
    it('creates article via knowledge service', async () => {
      knowledgeService.create.mockResolvedValue({});

      await ragAgent.addArticle({
        title: '标题',
        content: '内容',
        category: '分类',
      });

      expect(knowledgeService.create).toHaveBeenCalledWith({
        title: '标题',
        content: '内容',
        category: '分类',
      });
    });
  });
});
