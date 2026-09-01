// SPDX-License-Identifier: Apache-2.0

import { LlmProviderFactory } from './provider-factory';
import { LlmProvider } from '../interfaces/llm-provider.interface';
import { LlmProviderConfig } from '../interfaces/provider-config.interface';

describe('LlmProviderFactory', () => {
  const deepseekConfig: LlmProviderConfig = {
    name: 'deepseek',
    displayName: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    apiKey: 'test-deepseek-key',
    defaultModel: 'deepseek-v4-flash',
    availableModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    maxTokens: 4096,
    temperature: 0.7,
  };

  const qwenConfig: LlmProviderConfig = {
    name: 'qwen',
    displayName: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'test-qwen-key',
    defaultModel: 'qwen-max',
    availableModels: ['qwen-max', 'qwen-plus'],
    maxTokens: 4096,
    temperature: 0.7,
  };

  let factory: LlmProviderFactory;

  beforeEach(() => {
    factory = new LlmProviderFactory();
  });

  describe('register()', () => {
    it('should register a provider and make it retrievable', () => {
      factory.register(deepseekConfig);

      const provider = factory.getProvider('deepseek');
      expect(provider).toBeDefined();
      expect(provider.name).toBe('deepseek');
      expect(provider.displayName).toBe('DeepSeek');
      expect(provider.availableModels).toEqual([
        'deepseek-v4-flash',
        'deepseek-v4-pro',
      ]);
    });

    it('should throw when registering a provider with a duplicate name', () => {
      factory.register(deepseekConfig);

      expect(() => factory.register(deepseekConfig)).toThrow(
        'Provider "deepseek" is already registered',
      );
    });

    it('should allow registering multiple providers', () => {
      factory.register(deepseekConfig);
      factory.register(qwenConfig);

      const allProviders = factory.getAllProviders();
      expect(allProviders).toHaveLength(2);
    });
  });

  describe('getProvider()', () => {
    it('should retrieve a registered provider by name', () => {
      factory.register(deepseekConfig);

      const provider = factory.getProvider('deepseek');
      expect(provider).toBeDefined();
      expect(provider.name).toBe('deepseek');
    });

    it('should throw when provider is not found', () => {
      expect(() => factory.getProvider('nonexistent')).toThrow(
        'Provider "nonexistent" not found',
      );
    });

    it('should return distinct provider instances for different configs', () => {
      factory.register(deepseekConfig);
      factory.register(qwenConfig);

      const deepseek = factory.getProvider('deepseek');
      const qwen = factory.getProvider('qwen');

      expect(deepseek.name).toBe('deepseek');
      expect(qwen.name).toBe('qwen');
      expect(deepseek).not.toBe(qwen);
    });
  });

  describe('getAllProviders()', () => {
    it('should return empty array when no providers registered', () => {
      const providers = factory.getAllProviders();
      expect(providers).toEqual([]);
    });

    it('should return all registered providers', () => {
      factory.register(deepseekConfig);
      factory.register(qwenConfig);

      const providers = factory.getAllProviders();
      expect(providers).toHaveLength(2);
      const names = providers.map((p: LlmProvider) => p.name).sort();
      expect(names).toEqual(['deepseek', 'qwen']);
    });
  });

  describe('registerCustom()', () => {
    it('should register a custom provider and make it retrievable', () => {
      const custom: LlmProvider = {
        name: 'qianfan',
        displayName: '千帆',
        availableModels: ['ernie-4'],
        chat: jest.fn(),
        chatStream: jest.fn(),
      } as unknown as LlmProvider;

      const ret = factory.registerCustom(custom);

      expect(ret).toBe(factory);
      expect(factory.getProvider('qianfan')).toBe(custom);
    });

    it('should throw when registering a custom provider with a duplicate name', () => {
      const custom: LlmProvider = {
        name: 'dup',
        displayName: 'Dup',
        availableModels: ['m1'],
      } as unknown as LlmProvider;
      factory.registerCustom(custom);

      expect(() => factory.registerCustom(custom)).toThrow(
        'Provider "dup" is already registered',
      );
    });
  });
});
