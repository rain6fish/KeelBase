// SPDX-License-Identifier: Apache-2.0

/**
 * LLM Provider 工厂
 *
 * 管理多个 LLM Provider 的注册与获取。
 * DeepSeek、Qwen、OpenAI 等均使用同一套工厂注册机制。
 */

import { LlmProvider } from '../interfaces/llm-provider.interface';
import { LlmProviderConfig } from '../interfaces/provider-config.interface';
import { OpenAICompatibleProvider } from './openai-compatible.provider';
import { CircuitBreakerService } from '../../circuit-breaker/circuit-breaker.service';

export class LlmProviderFactory {
  private readonly providers = new Map<string, LlmProvider>();

  constructor(private readonly circuitBreaker?: CircuitBreakerService) {}

  /**
   * 注册一个 Provider
   * 对于 OpenAI 兼容格式的 Provider（deepseek、qwen 等），
   * 自动实例化 OpenAICompatibleProvider。
   */
  register(config: LlmProviderConfig): LlmProviderFactory {
    if (this.providers.has(config.name)) {
      throw new Error(`Provider "${config.name}" is already registered`);
    }

    const provider = new OpenAICompatibleProvider(config, this.circuitBreaker);
    this.providers.set(config.name, provider);
    return this;
  }

  /**
   * 注册自定义 Provider（非 OpenAI 兼容格式，如百度千帆）
   */
  registerCustom(provider: LlmProvider): LlmProviderFactory {
    if (this.providers.has(provider.name)) {
      throw new Error(`Provider "${provider.name}" is already registered`);
    }

    this.providers.set(provider.name, provider);
    return this;
  }

  /**
   * 获取指定名称的 Provider
   */
  getProvider(name: string): LlmProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider "${name}" not found`);
    }
    return provider;
  }

  /**
   * 获取所有已注册的 Provider
   */
  getAllProviders(): LlmProvider[] {
    return Array.from(this.providers.values());
  }
}
