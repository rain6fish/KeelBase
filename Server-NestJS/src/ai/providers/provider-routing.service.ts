// SPDX-License-Identifier: Apache-2.0

/**
 * LLM Provider 路由与回退（从 `AiService` 拆出的第六个领域，健康清单 §3 阶段 3「主战场」）。
 *
 * 回答的是：**这次请求由哪个 provider 来跑，跑不动时换谁**——
 * 选路（请求指定 > 默认）、回退链、非流式回退（`tryFallback`）与流式回退（`streamWithProviderFallback`）。
 * 与「怎么跑一次对话」无关：本域只认 provider 名与失败，不认识会话、工具、审计。
 *
 * 注意与 `RouterAgent` 的区别：那个是**意图**路由（决定走对话/知识/计划），本域是**供应商**路由。
 *
 * **行为与拆分前逐字一致**——搬迁不改逻辑（阶段 3 纪律：行为不变，测试作护栏）。
 */
import { LlmProviderFactory } from './provider-factory';
import { BusinessException } from '../../common/errors/business.exception';
import {
  ChatMessage,
  GenerateResult,
  LlmProvider,
  StreamChunk,
} from '../interfaces/llm-provider.interface';

// demo = 确定性演示 Provider（P0-0）：无任何云 Provider 时兜底，链尾最后尝试
const FALLBACK_CHAIN: Record<string, string[]> = {
  deepseek: ['deepseek', 'qwen', 'openai', 'demo'],
  qwen: ['qwen', 'deepseek', 'openai', 'demo'],
  openai: ['openai', 'qwen', 'deepseek', 'demo'],
  anthropic: ['anthropic', 'deepseek', 'qwen', 'openai', 'demo'],
  gemini: ['gemini', 'deepseek', 'qwen', 'openai', 'demo'],
};

export class ProviderRoutingService {
  constructor(
    private readonly providerFactory: LlmProviderFactory,
    /** 默认 provider（未指定时用）；由 AiService 工厂在组装期传入，避免本域反向依赖配置对象。 */
    private readonly defaultProvider: string,
  ) {}

  /**
   * 本次请求要用的 provider（请求指定优先，否则默认）+ 生效名。
   * 只暴露调用方真正要的两样——此前的 `conversation: null` 是无人读的残留字段，一并去掉。
   */
  resolve(requestedProvider?: string): { providerName: string; provider: LlmProvider } {
    const providerName = requestedProvider ?? this.defaultProvider;
    const chain = this.fallbackChain(providerName);
    const errors: string[] = [];

    for (const name of chain) {
      try {
        const provider = this.providerFactory.getProvider(name);
        return { providerName: name, provider };
      } catch {
        errors.push(`${name}: not found`);
        continue;
      }
    }

    // Can't happen since getProvider throws but let's be safe
    // NC-2：无可用 provider（未配置/找不到）→ 可执行码而非裸 500（CR-5 细节只进日志）
    console.warn(`[AiService] No provider available: ${errors.join('; ')}`);
    throw BusinessException.of('LLM_UNAVAILABLE');
  }

  /** 某 provider 的回退链（链首即自身）；未登记的名字只回退自己。 */
  fallbackChain(providerName: string): string[] {
    return FALLBACK_CHAIN[providerName] ?? [providerName];
  }

  /** 按名取 provider 实例——回退成功后据此取回**实际生效**的那个，而不是链首。 */
  provider(name: string): LlmProvider {
    return this.providerFactory.getProvider(name);
  }

  /** 非流式回退：按链逐个试 `generate`，全失败返回 null（由调用方给出可执行错误码）。 */
  async tryFallback(
    fallbackChain: string[],
    model: string,
    params: { messages: ChatMessage[]; tools?: any[] },
  ): Promise<{ result: GenerateResult; providerName: string } | null> {
    for (const name of fallbackChain) {
      try {
        const provider = this.providerFactory.getProvider(name);
        const result = await provider.generate({
          messages: params.messages,
          tools: params.tools,
          model,
        });
        return { result, providerName: name };
      } catch (fallbackErr) {
        console.error(
          '[AiService] Fallback provider "%s" also failed: %s',
          name,
          (fallbackErr as Error).message,
        );
        continue;
      }
    }
    return null;
  }

  /**
   * 流式 Fallback（CR-28）：主 provider 在产出任何内容之前失败（stream() 抛错 /
   * 首个 chunk 即 error）时，切换下一个 provider 重开流；已产出内容后的错误
   * 无法干净回退，直接透传。全部失败时 yield 一个最终 error chunk。
   */
  async *streamWithProviderFallback(params: {
    chain: string[];
    messages: ChatMessage[];
    tools?: any[];
    model: string;
  }): AsyncIterable<StreamChunk> {
    let lastError = 'Unknown provider error';
    for (const name of params.chain) {
      let provider: LlmProvider;
      try {
        provider = this.providerFactory.getProvider(name);
      } catch {
        lastError = `Provider "${name}" is not configured`;
        continue;
      }
      let hasContent = false;
      try {
        const stream = provider.stream({
          messages: params.messages,
          tools: params.tools,
          model: params.model,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'error') {
            lastError = chunk.error ?? 'Unknown stream error';
            if (hasContent) {
              // 已产出内容 → 无法回退，透传错误并停止
              yield chunk;
              return;
            }
            // 首个 chunk 即错误（未产出任何内容）→ 尝试下一个 provider
            break;
          }
          hasContent = true;
          yield chunk;
        }
        // 正常完整结束 → 成功；首块错误 break（hasContent=false）→ 继续外层循环
        if (hasContent) return;
      } catch (err) {
        lastError = (err as Error).message;
        if (hasContent) throw err;
        console.error(
          '[AiService] Streaming provider "%s" failed: %s',
          name,
          lastError,
        );
      }
    }
    yield {
      type: 'error',
      error: `All providers failed. Last error: ${lastError}`,
    };
  }
}
