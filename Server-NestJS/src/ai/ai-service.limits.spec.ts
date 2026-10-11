// SPDX-License-Identifier: Apache-2.0

import { AiService } from './ai.service';
import { StreamChunk } from './interfaces/llm-provider.interface';
import { aiService, config, confirmationStore, installAiServiceTestbed, llmRouter, mockAuditService, mockAuthorizationExplainer, mockConversationService, mockMemoriesService, mockProvider, mockRagAgent, mockSettingsService, mockSubAgentOrchestrator, mockToolGate, mockToolRegistry, mockUsageQuota, presentation, r4Approval, toolExecution, toolExposure } from '../../test/ai-service.testbed';

beforeEach(installAiServiceTestbed);






  describe('AiService › RG-2.1 AI 每日限额（原子预留）', () => {
    it('limit=0（不限）时正常放行且不预留', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(0);
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await expect(aiService.chat('1', { message: 'hi' })).resolves.toBeDefined();
      expect(mockProvider.generate).toHaveBeenCalled();
      expect(mockUsageQuota.reserveDailyUsage).not.toHaveBeenCalled();
    });

    it('limit>0 且预留成功时放行（成功保留不计额外自增）', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(10);
      mockUsageQuota.reserveDailyUsage.mockResolvedValue(true);
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await expect(aiService.chat('1', { message: 'hi' })).resolves.toBeDefined();
      expect(mockUsageQuota.reserveDailyUsage).toHaveBeenCalledWith('1', 10);
      expect(mockUsageQuota.releaseDailyUsage).not.toHaveBeenCalled();
    });

    it('limit>0 且已达上限（预留失败）时抛 AI_DAILY_LIMIT', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(10);
      mockUsageQuota.reserveDailyUsage.mockResolvedValue(false);

      await expect(aiService.chat('1', { message: 'hi' }))
        .rejects.toMatchObject({ errorCode: 'AI_DAILY_LIMIT' });
      expect(mockProvider.generate).not.toHaveBeenCalled();
    });

    it('对话失败时释放预留槽（不占当日额度）', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(10);
      mockUsageQuota.reserveDailyUsage.mockResolvedValue(true);
      mockProvider.generate.mockRejectedValue(new Error('provider down'));

      await expect(aiService.chat('1', { message: 'hi' }))
        .rejects.toMatchObject({ errorCode: 'LLM_UNAVAILABLE' });
      expect(mockUsageQuota.releaseDailyUsage).toHaveBeenCalledWith('1');
    });

    it('流式 chatStream 同样校验限额', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(5);
      mockUsageQuota.reserveDailyUsage.mockResolvedValue(false);

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'hi' })) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === 'error')).toBe(true);
      expect(mockProvider.stream).not.toHaveBeenCalled();
    });

    it('流式 provider 失败：转 error chunk + done，释放预留（零 token 失败不计入用量）', async () => {
      mockSettingsService.getAiDailyLimit.mockResolvedValue(5);
      mockUsageQuota.reserveDailyUsage.mockResolvedValue(true);
      // stream 首块即抛错 → streamWithProviderFallback 内部转 error chunk + done（不抛给调用方）
      mockProvider.stream.mockImplementation(() =>
        (async function* () {
          throw new Error('stream down');
        })(),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of aiService.chatStream('1', { message: 'hi' })) chunks.push(chunk);

      expect(chunks.some((c) => c.type === 'error')).toBe(true);
      expect(chunks[chunks.length - 1].type).toBe('done');
      // 流式零 token 失败释放预留槽（对齐非流式 chat 失败语义），防误计入当日用量误拦
      expect(mockUsageQuota.releaseDailyUsage).toHaveBeenCalled();
    });

    it('未注入 SettingsService 时跳过限额', async () => {
      // 构造一个不带 settingsService 的 AiService
      const bare = new AiService(
        llmRouter as any,
        mockToolRegistry as any,
        mockConversationService as any,
        config,
        mockAuditService as any,
      mockUsageQuota as any,
      mockToolGate as any,
      toolExecution as any,
      r4Approval as any,
      presentation as any,
      toolExposure as any,
        mockRagAgent as any,
        { createForUser: jest.fn().mockReturnValue({ cannot: () => false }) } as any,
        mockMemoriesService as any,
        confirmationStore,
        { ensureCompacted: jest.fn().mockImplementation((c: any) => ({ conversation: c })) } as any,
        mockSubAgentOrchestrator as any,
        mockAuthorizationExplainer as any,
      );
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await expect(bare.chat('1', { message: 'hi' })).resolves.toBeDefined();
      expect(mockUsageQuota.reserveDailyUsage).not.toHaveBeenCalled();
    });
  });

  describe('AI-17 提示词管理', () => {
    it('Settings 配置了 ai_system_prompt 时优先使用', async () => {
      mockSettingsService.getWithDefault.mockResolvedValue('自定义系统提示词');
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await aiService.chat('1', { message: 'hi' });

      // 主对话（工具循环）的调用以自定义 system 开头；router 分类用其自身 prompt
      const sent = mockProvider.generate.mock.calls[mockProvider.generate.mock.calls.length - 1][0];
      expect(sent.messages[0].content).toBe('自定义系统提示词');
    });

    it('Settings 未配置时用默认 system prompt', async () => {
      mockSettingsService.getWithDefault.mockImplementation(async (_k: string, d: unknown) => d);
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await aiService.chat('1', { message: 'hi' });

      const sent = mockProvider.generate.mock.calls[mockProvider.generate.mock.calls.length - 1][0];
      expect(sent.messages[0].content).toBe(config.systemPrompt);
    });

    it('System AI Assistant：ChatRequest.systemPrompt 覆盖 Settings/默认', async () => {
      mockSettingsService.getWithDefault.mockResolvedValue('Settings 里的自定义提示词');
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      await aiService.chat('1', { message: 'hi', systemPrompt: 'ADMIN_PROMPT' });

      const sent = mockProvider.generate.mock.calls[mockProvider.generate.mock.calls.length - 1][0];
      // 覆盖优先于 Settings 与默认
      expect(sent.messages[0].content).toBe('ADMIN_PROMPT');
    });
  });

