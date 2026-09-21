// SPDX-License-Identifier: Apache-2.0

import { ProviderRoutingService } from './provider-routing.service';
import { LlmProviderFactory } from './provider-factory';

/**
 * Provider 路由与回退单测（阶段 3 第六刀从 ai.service.spec.ts 整段搬来，**断言一字未改**，
 * 仅调用形改为本服务；resolve 的形参也只留了它真正读的 provider 名）。
 */
describe('ProviderRoutingService（路由与回退）', () => {
  let routing: ProviderRoutingService;
  let mockProviderFactory: jest.Mocked<LlmProviderFactory>;
  let mockProvider: jest.Mocked<{
    name: string;
    displayName: string;
    availableModels: string[];
    isOpenAICompatible: jest.Mock;
    generate: jest.Mock;
    stream: jest.Mock;
  }>;

  beforeEach(() => {
    mockProvider = {
      name: 'deepseek',
      displayName: 'DeepSeek',
      availableModels: ['deepseek-v4-flash'],
      isOpenAICompatible: jest.fn().mockReturnValue(true),
      generate: jest.fn(),
      stream: jest.fn(),
    };
    mockProviderFactory = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
      getAllProviders: jest.fn(),
      register: jest.fn(),
      registerCustom: jest.fn(),
    } as any;
    routing = new ProviderRoutingService(mockProviderFactory as any, 'deepseek');
  });

    it('streamWithProviderFallback：主 provider 未配置回退下一个', async () => {
      mockProviderFactory.getProvider.mockImplementation((name: string) => {
        if (name === 'broken') throw new Error('not configured');
        return mockProvider;
      });
      async function* s() { yield { type: 'text' as const, content: 'ok' }; yield { type: 'done' as const }; }
      mockProvider.stream.mockReturnValue(s());

      const chunks: any[] = [];
      for await (const c of routing.streamWithProviderFallback({
        chain: ['broken', 'deepseek'],
        messages: [{ role: 'user', content: 'x' }],
        tools: [],
        model: 'm',
      })) {
        chunks.push(c);
      }
      expect(chunks.some((c) => c.type === 'text' && c.content === 'ok')).toBe(true);
      expect(mockProvider.stream).toHaveBeenCalledTimes(1); // 只在 deepseek 上调用
    });

    it('streamWithProviderFallback：产出内容后遇 error 透传并停止（不回退）', async () => {
      mockProviderFactory.getProvider.mockReturnValue(mockProvider);
      async function* s() {
        yield { type: 'text' as const, content: 'partial' };
        yield { type: 'error' as const, error: 'boom' };
      }
      mockProvider.stream.mockReturnValue(s());

      const chunks: any[] = [];
      for await (const c of routing.streamWithProviderFallback({
        chain: ['deepseek'],
        messages: [],
        tools: [],
        model: 'm',
      })) {
        chunks.push(c);
      }
      expect(chunks.some((c) => c.type === 'text')).toBe(true);
      expect(chunks.some((c) => c.type === 'error')).toBe(true);
      expect(mockProvider.stream).toHaveBeenCalledTimes(1);
    });

  describe('resolveProvider（Fallback 链）', () => {
    it('默认 provider 可用 → 直接返回', () => {
      const r = routing.resolve();
      expect(r.providerName).toBe('deepseek');
      expect(r.provider).toBe(mockProvider);
    });

    it('主 provider 抛错 → 回退链下一个', () => {
      mockProviderFactory.getProvider.mockImplementation((name: string) => {
        if (name === 'deepseek') throw new Error('not configured');
        return mockProvider;
      });
      const r = routing.resolve('deepseek');
      expect(r.providerName).toBe('qwen');
      expect(r.provider).toBe(mockProvider);
    });

    it('链上全部抛错 → throw 汇总错误', () => {
      mockProviderFactory.getProvider.mockImplementation(() => { throw new Error('down'); });
      let caught: unknown;
      try {
        routing.resolve('openai');
      } catch (e) {
        caught = e;
      }
      expect(caught).toMatchObject({ errorCode: 'LLM_UNAVAILABLE' });
    });

    it('anthropic 可用 → 返回 anthropic（FALLBACK 链含降级）', () => {
      const r = routing.resolve('anthropic');
      expect(r.providerName).toBe('anthropic');
      expect(r.provider).toBe(mockProvider);
    });

    it('gemini 可用 → 返回 gemini', () => {
      const r = routing.resolve('gemini');
      expect(r.providerName).toBe('gemini');
      expect(r.provider).toBe(mockProvider);
    });
});
});
