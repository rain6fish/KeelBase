// SPDX-License-Identifier: Apache-2.0

import { LlmProviderFactory } from '../../ai/providers/provider-factory';
import { AiTaskNode } from '../flow-definition.types';

/**
 * AITask 节点（FLOW-2）：复用 LLM 编排（护栏优先：AI 节点只做读/处理，写需走 human_task 确认）。
 * 结果写入 data[outputKey]，默认 ai_result。
 */
export async function runAiTask(
  providerFactory: LlmProviderFactory,
  node: AiTaskNode,
  data: Record<string, unknown>,
  providerName = 'deepseek',
  model?: string,
): Promise<Record<string, unknown>> {
  const provider = providerFactory.getProvider(providerName);
  const res = await provider.generate({
    messages: [
      { role: 'system', content: '你是一个工作流处理助手。根据给定上下文完成处理任务，输出精炼结果，不要编造事实。' },
      { role: 'user', content: `${node.prompt}\n上下文：${JSON.stringify(data)}` },
    ],
    model: model ?? provider.availableModels[0] ?? 'deepseek-chat',
  });
  return { ...data, [node.outputKey ?? 'ai_result']: res.content };
}
