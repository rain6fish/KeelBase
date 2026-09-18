// SPDX-License-Identifier: Apache-2.0

/**
 * Reflection Agent — 自我改进
 *
 * 在 LLM 生成回复后，让 LLM 自我审核并改进。
 * 提升代码生成、分析报告、文案等场景的输出质量。
 */

import { ChatMessage, LlmProvider } from '../interfaces/llm-provider.interface';
import { LlmUsage } from '../llm-usage';

const REFLECTION_PROMPT = `请审核上一条回答的质量，从以下维度评估：
1. 准确性：数据是否正确？逻辑是否通顺？
2. 完整性：是否遗漏了用户的任何需求？
3. 简洁性：是否有多余的信息？
4. 专业性：语气是否合适？

如果回答质量已经很好，只回复 "OK"。
如果有改进空间，输出改进后的完整版本。`;

export class ReflectionAgent {
  /**
   * 对 LLM 响应进行自我审核和改进
   */
  async reflect(
    originalMessages: ChatMessage[],
    originalReply: string,
    provider: LlmProvider,
    model?: string,
  ): Promise<{ content: string; usage?: LlmUsage }> {
    // 只有较长的回复才有反思的价值
    if (originalReply.length < 50) return { content: originalReply };

    try {
      const result = await provider.generate({
        messages: [
          ...originalMessages,
          { role: 'assistant', content: originalReply },
          { role: 'user', content: REFLECTION_PROMPT },
        ],
        model: model ?? provider.availableModels[0],
        maxTokens: 2048,
        temperature: 0.3,
      });

      const improved = result.content.trim();
      // 无论是否采纳改进，这次调用都已消耗 token → 用量照样带回，不吞
      if (improved === 'OK' || !improved) return { content: originalReply, usage: result.usage };
      return { content: improved, usage: result.usage };
    } catch {
      return { content: originalReply };
    }
  }
}
