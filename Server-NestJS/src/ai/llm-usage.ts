// SPDX-License-Identifier: Apache-2.0

/**
 * LLM 用量（prompt + completion）与其累加规则。
 *
 * 一次用户提问可能触发意图分类、任务分解、子代理多轮工具循环、计划、汇总、反思等**多次**真实
 * LLM 调用，而审计的 `chat` 行一轮只写一次。因此调用链的每一层都要把用量向上传递，最终按本模块
 * 的规则累加成整轮开销——只保留最后一次会漏记前面的调用。
 *
 * 单源原因：此前流式、非流式工具循环、各 agent 各写了一份求和，口径容易漂移。
 */

/** 一次 LLM 调用的用量 */
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

/** 累加两笔用量：任一侧缺省时取另一侧，两侧都有则相加。 */
export function addLlmUsage(base?: LlmUsage, extra?: LlmUsage): LlmUsage | undefined {
  if (!extra) return base;
  if (!base) return { ...extra };
  return {
    promptTokens: base.promptTokens + extra.promptTokens,
    completionTokens: base.completionTokens + extra.completionTokens,
  };
}
