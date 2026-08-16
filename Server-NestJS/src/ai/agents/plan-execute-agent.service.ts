/**
 * Plan-and-Execute Agent — 多步推理
 *
 * 将复杂任务拆解为多个步骤，逐步执行工具，汇总结果后回复。
 * 支持步骤间结果传递、错误恢复。
 */

import {
  ChatMessage,
  LlmProvider,
  ToolCall,
} from '../interfaces/llm-provider.interface';
import { ToolRegistry } from '../tools/tool-registry';

interface PlanStep {
  description: string;
  tool: string;
  args: Record<string, unknown>;
  dependsOn?: number[]; // 依赖的步骤索引
}

const PLAN_PROMPT = `你是任务规划专家。将用户请求拆解为多个步骤，每个步骤调用一个工具。
输出 JSON 数组格式，不要包含其他内容：
[
  {
    "description": "步骤描述",
    "tool": "工具名",
    "args": { "参数名": "参数值" },
    "dependsOn": []  // 依赖的步骤索引（从 0 开始），无依赖则留空
  }
]

可用的工具及参数：
- query_events(startDate, endDate, status?, limit?): 查询事件
- count_events_by_status(startDate?, endDate?): 统计事件
- get_user_stats(): 用户统计
- query_events_by_keyword(keyword, startDate?, endDate?): 搜索事件

注意：
- 如果某个步骤失败，依赖它的步骤将无法执行
- 只输出 JSON，不要解释`;

export class PlanExecuteAgent {
  /**
   * 规划并执行多步任务
   */
  async planAndExecute(
    messages: ChatMessage[],
    provider: LlmProvider,
    toolRegistry: ToolRegistry,
    userId: string,
    model?: string,
  ): Promise<{ content: string; stepResults: string[] }> {
    // Step 1: 让 LLM 生成执行计划
    const planResult = await provider.generate({
      messages: [
        { role: 'system', content: PLAN_PROMPT },
        ...messages.slice(-2), // 只用最近的 system + user
      ],
      model: model ?? provider.availableModels[0],
      maxTokens: 2048,
      temperature: 0.2,
    });

    let steps: PlanStep[];
    try {
      // 从 LLM 响应中提取 JSON
      const jsonStr = planResult.content.replace(/```json|```/g, '').trim();
      steps = JSON.parse(jsonStr) as PlanStep[];
      if (!Array.isArray(steps)) throw new Error('Not an array');
    } catch {
      // 规划失败，走普通查询
      return { content: '', stepResults: [] };
    }

    // Step 2: 按顺序执行
    const stepResults: string[] = new Array(steps.length).fill('');

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // 检查依赖是否成功（失败步骤记 'ERROR: ...'，前缀匹配）
      const depsFailed = (step.dependsOn ?? []).some(
        (depIdx) => String(stepResults[depIdx] ?? '').startsWith('ERROR'),
      );
      if (depsFailed) {
        stepResults[i] = 'ERROR';
        continue;
      }

      try {
        const result = await toolRegistry.execute(step.tool, step.args, userId);
        stepResults[i] = result.success
          ? JSON.stringify(result.data)
          : `ERROR: ${result.error}`;
      } catch (err) {
        stepResults[i] = `ERROR: ${(err as Error).message}`;
      }
    }

    // Step 3: 汇总结果
    const summaryParts: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      summaryParts.push(
        `步骤 ${i + 1}: ${steps[i].description}\n结果: ${stepResults[i]}`,
      );
    }

    return {
      content: summaryParts.join('\n\n'),
      stepResults,
    };
  }
}
