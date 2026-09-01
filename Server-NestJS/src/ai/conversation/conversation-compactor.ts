// SPDX-License-Identifier: Apache-2.0

/**
 * 对话压缩器 — ConversationCompactor
 *
 * 长对话上下文压缩：把最旧的轮次压缩成一段中文摘要持久化到
 * ai_conversations.summary，之后 buildMessages 回放「摘要 + 最近窗口」。
 *
 * 同步压缩（穿越阈值的回合付一次 LLM 调用），失败优雅降级（全量回放）。
 * plain class，由 AiService 的 useFactory 手动组合（同 RouterAgent 模式）。
 */

import { LlmProviderFactory } from '../providers/provider-factory';
import { LlmProvider } from '../interfaces/llm-provider.interface';
import { AiServiceConfig } from '../ai.service';
import { ConversationService, ConversationData } from './conversation.service';

const COMPACT_THRESHOLD = 40;
const KEEP_RECENT = 12;
const MAX_SUMMARIZE_PER_MSG = 500;
const SUMMARY_MAX_TOKENS = 512;
const SUMMARY_TEMPERATURE = 0.3;

const SUMMARY_SYSTEM_PROMPT = `你是对话压缩助手。把下面这段对话压缩成一段中文摘要，不超过 300 字。
必须保留：用户的偏好、已做的决定、进行中的任务与待办、关键事实与数据。
不要编造，不要给建议。只输出摘要正文。`;

export class ConversationCompactor {
  /** 并发保护：同一对话的压缩只跑一次 LLM 调用 */
  private readonly inflight = new Map<string, Promise<ConversationData>>();

  constructor(
    private readonly providerFactory: LlmProviderFactory,
    private readonly config: AiServiceConfig,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * 确保对话已压缩。消息数 ≤ 阈值时不处理；
   * 超过阈值（无论是否已有摘要）触发折叠式重压缩。
   */
  async ensureCompacted(conv: ConversationData): Promise<ConversationData> {
    if (conv.messages.length <= COMPACT_THRESHOLD) return conv;

    const existing = this.inflight.get(conv.id);
    if (existing) {
      await existing;
      return this.conversationService.peekConversation(conv.id);
    }

    const task = this.doCompact(conv).finally(() => this.inflight.delete(conv.id));
    this.inflight.set(conv.id, task);
    return task;
  }

  private async doCompact(conv: ConversationData): Promise<ConversationData> {
    try {
      // 最近窗口 + 边界 tool 溢出守卫
      let keepStart = Math.max(0, conv.messages.length - KEEP_RECENT);
      while (keepStart > 0 && conv.messages[keepStart].role === 'tool') keepStart--;

      const toSummarize = conv.messages.slice(0, keepStart);
      if (toSummarize.length < 4) return conv; // 太短不值得一次 LLM 调用

      const keep = conv.messages.slice(keepStart);
      const provider = this.resolveProvider(conv.provider);
      const summary = await this.summarize(
        provider,
        conv.model,
        conv.summary,
        toSummarize,
      );

      const raw = await this.conversationService.getMessagesForCompaction(conv.id);
      const deleteIds = raw.slice(0, toSummarize.length).map((m) => m.id);
      await this.conversationService.applyCompaction(conv.id, summary, deleteIds);

      return { ...conv, summary, messages: keep };
    } catch (err) {
      console.error(
        `[ConversationCompactor] compaction failed for ${conv.id}:`,
        (err as Error).message,
      );
      return conv; // 降级：全量回放，下轮重试
    }
  }

  private resolveProvider(providerName: string): LlmProvider {
    try {
      return this.providerFactory.getProvider(providerName);
    } catch {
      return this.providerFactory.getProvider(this.config.defaultProvider);
    }
  }

  private async summarize(
    provider: LlmProvider,
    model: string | undefined,
    priorSummary: string | undefined,
    toSummarize: Array<{ role: string; content: string }>,
  ): Promise<string> {
    const turns = toSummarize
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
      .map((m) => {
        const text = m.content.slice(0, MAX_SUMMARIZE_PER_MSG);
        return `${m.role === 'user' ? '用户' : '助手'}：${text}`;
      })
      .join('\n');

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
    ];
    if (priorSummary) {
      messages.push({
        role: 'user',
        content: `已有摘要：\n${priorSummary}\n\n以下为新增的较早对话（需要并入摘要）：\n${turns}`,
      });
    } else {
      messages.push({ role: 'user', content: turns });
    }

    const result = await provider.generate({
      messages,
      model: model ?? this.config.defaultModel,
      maxTokens: SUMMARY_MAX_TOKENS,
      temperature: SUMMARY_TEMPERATURE,
    });

    const summary = (result.content ?? '').trim();
    if (!summary) {
      throw new Error('Empty summary from LLM');
    }
    return summary;
  }
}
