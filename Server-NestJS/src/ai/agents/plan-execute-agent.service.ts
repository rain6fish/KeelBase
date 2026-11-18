// SPDX-License-Identifier: Apache-2.0

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
import { ToolResult } from '../interfaces/tool.interface';
import { ToolRegistry } from '../tools/tool-registry';
import { LlmUsage } from '../llm-usage';
import { sanitizeExternalContent } from '../security/injection-guard';
import { TOOL_RESULT_MAX_CHARS } from '../tools/tool-presentation.service';

/** 只读门控执行器：由 AiService 注入（_assertToolAllowed + 只读强制），缺省回落直调 registry.execute。 */
export type ReadOnlyToolExecutor = (
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
) => Promise<ToolResult>;

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
    readOnlyExecutor?: ReadOnlyToolExecutor,
    /**
     * The rendering a model receives for a tool result — the same one the chat paths use (masking +
     * HS-5 truncation). The step results are embedded in the summary prompt, so without it raw tool
     * data would reach a model untouched.
     *
     * 交给模型的工具结果渲染 —— 与对话路径同一份（脱敏 + HS-5 截断）。步骤结果会被拼进汇总提示词，
     * 没有它就会被原样交给模型。
     */
    render?: (result: ToolResult) => string,
  ): Promise<{ content: string; stepResults: string[]; usage?: LlmUsage }> {
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
      // 规划失败，走普通查询；但这次规划调用已经花了 token → 用量照样带回
      return { content: '', stepResults: [], usage: planResult.usage };
    }

    // Step 2: 按顺序执行
    // NC-3 只读门控：AiService 注入 readOnlyExecutor（_assertToolAllowed + 写工具拒绝）时经其执行，
    // 防 LLM 计划的步骤直调写/被治理禁用的工具（Runtime over Prompt——prompt 只约束不执行）。
    const execute = readOnlyExecutor ?? ((tool: string, args: Record<string, unknown>, uid: string) => toolRegistry.execute(tool, args, uid));
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
        const result = await execute(step.tool, step.args, userId);
        // The summary model reads these results, so they take the same rendering the chat paths give
        // a model; without a renderer at least the string-level sanitizer runs. The `ERROR:` prefix
        // stays the dependency signal below.
        //
        // 汇总模型会读到这些结果，故走与对话路径同一份渲染；没有渲染器时至少过字符串级脱敏。
        // `ERROR:` 前缀仍是下方判定依赖失败的信号。
        stepResults[i] = result.success
          ? renderForModel(result, render)
          : `ERROR: ${sanitizeExternalContent(String(result.error ?? ''))}`;
      } catch (err) {
        // A rejected value is not necessarily an `Error`: a proxied or external tool can throw a
        // string or a plain object, and `(err as Error).message` is then undefined — which
        // `sanitizeExternalContent` cannot take (it reads `input.length`). Coerce first.
        // 被拒的值不一定是 `Error`：代理或外部工具可能抛出字符串或普通对象，此时
        // `(err as Error).message` 为 undefined，而 `sanitizeExternalContent` 读 `input.length`，
        // 会在此处再抛一次。先归一成字符串。
        const message = err instanceof Error ? err.message : String(err);
        stepResults[i] = `ERROR: ${sanitizeExternalContent(message)}`;
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
      usage: planResult.usage,
    };
  }
}

const UNRENDERABLE_RESULT = '…[结果无法渲染]';

/**
 * The rendering a model receives for one **successful** step — produced without letting the
 * formatter decide the step's outcome. Rendering is evidence, not a gate (the rule
 * `AiService._agentStepExecutor` follows): a formatter throw used to land in the step's catch and
 * turn a successful call into an `ERROR: …` step, so dependents were skipped and the summary model
 * was told the call failed. A throw now falls back to the sanitized JSON text; if the payload
 * cannot be serialized at all (cyclic / BigInt), the marker keeps the step a success with an
 * honest "result not renderable" note.
 *
 * 成功步骤交给模型的渲染 —— 生成它不再决定步骤成败。渲染是证据、不是闸（与
 * `AiService._agentStepExecutor` 同一条规则）：格式化抛错原先落进步骤的 catch，把一次成功调用
 * 变成 `ERROR: …` 步骤 —— 下游被跳过、汇总模型被告知调用失败。现在抛错退回脱敏后的 JSON 文本；
 * 若载荷根本无法序列化（循环引用 / BigInt），用标记让该步骤仍是成功，并如实注明「结果无法渲染」。
 */
function renderForModel(
  result: ToolResult,
  render?: (result: ToolResult) => string,
): string {
  if (render) {
    try {
      return render(result);
    } catch {
      // A formatter throw falls through to the no-renderer text below; the step stays a success.
      // 渲染抛错 ⇒ 落到下面的无渲染器文本；步骤成败不受影响。
    }
  }
  try {
    return boundToBudget(sanitizeExternalContent(JSON.stringify(result.data ?? '')));
  } catch {
    return UNRENDERABLE_RESULT;
  }
}

/**
 * Bound a no-renderer step result by the same budget the rendered path honours. The constant is
 * shared with `ToolPresentationService`, never a second copy of the number; the marker keeps the
 * cut honest, and what is kept stays masked because masking runs first.
 *
 * 没有渲染器时，步骤结果受渲染路径同一条预算约束。常量与 `ToolPresentationService` 共用，不另造
 * 一个数字；截断标记如实说明被截过，保留部分仍是打码后的文本（打码先于截断）。
 */
function boundToBudget(text: string): string {
  const marker = '…[截断]';
  if (text.length <= TOOL_RESULT_MAX_CHARS) return text;
  return text.slice(0, TOOL_RESULT_MAX_CHARS - marker.length) + marker;
}
