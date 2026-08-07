/**
 * Reflection Agent — 自我改进
 *
 * 在 LLM 生成回复后，让 LLM 自我审核并改进。
 * 提升代码生成、分析报告、文案等场景的输出质量。
 */

import { ChatMessage, LlmProvider } from '../interfaces/llm-provider.interface';

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
  ): Promise<string> {
    // 只有较长的回复才有反思的价值
    if (originalReply.length < 50) return originalReply;

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
      if (improved === 'OK' || !improved) return originalReply;
      return improved;
    } catch {
      return originalReply;
    }
  }
}
