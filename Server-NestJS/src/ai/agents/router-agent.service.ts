/**
 * Router Agent — 意图路由
 *
 * 用轻量级 LLM 调用对用户意图分类，不同意图走不同的处理策略：
 * - query: 单步数据查询（走现有 Tool Loop）
 * - analyze: 需要分析推理（走 Plan-and-Execute）
 * - navigate: 页面跳转（不走 LLM）
 * - chat: 纯聊天（不走工具）
 * - plan: 复杂多步任务（走 Plan-and-Execute）
 * - knowledge: 咨询知识库/文档/规则（走 RAG）
 * - delegate: 多域复杂任务（拆分子代理执行，走 SubAgentOrchestrator）
 */

import { LlmProvider } from '../interfaces/llm-provider.interface';

export type Intent = 'query' | 'analyze' | 'navigate' | 'chat' | 'plan' | 'knowledge' | 'delegate';

const INTENT_CLASSIFICATION_PROMPT = `你是一个意图分类器。分析用户的消息，只返回一个词作为分类结果。

分类规则：
- query：用户询问自己的数据、事件、日程、统计等。需要查数据库。
- analyze：用户要求分析、对比、建议、预测、总结等。需要多步推理。
- navigate：用户要求跳转到某个页面或功能。如"打开设置"、"去首页"。
- plan：用户要求做计划、排期、安排、规划等。需要多步操作。
- chat：通用聊天、问候、闲聊。不需要查数据。
- knowledge：用户咨询知识库/公司规定/政策/产品手册/使用文档等。需要从知识库检索。
- delegate：用户要求综合分析、分别处理、统筹规划、全面盘点等涉及多个领域的复杂任务。需要拆分成多个子任务分别执行再汇总。

示例：
- "本月有哪些事件？" → query
- "分析我的工作安排趋势" → analyze
- "打开设置" → navigate
- "你好" → chat
- "帮我安排下周的会议" → plan
- "年假政策是什么？" → knowledge
- "帮我综合分析本周日程并安排" → delegate

只返回一个词。`;

export class RouterAgent {
  /**
   * 分类用户意图
   */
  async classify(
    message: string,
    provider: LlmProvider,
    model?: string,
  ): Promise<Intent> {
    // 关键词快速匹配 — 不走 LLM，零成本
    // 单字「去」太泛（去年/过去/出去/失去等误判为导航），用否定前瞻仅匹配导航含义
    const navKeywords: Array<string | RegExp> = ['打开', /去(?!年|下|出|掉|过|除)/, '跳转', '转到', '前往', '进入'];
    if (navKeywords.some((k) => (typeof k === 'string' ? message.includes(k) : k.test(message)))) return 'navigate';

    // 多域复杂任务（放在 plan 之前：这些措辞的「安排/规划」指综合处理，非单一排期）
    const delegateKeywords = ['综合分析', '综合来看', '分别', '统筹', '全面分析', '盘点', '帮我规划', '做个规划', '汇总一下', '归纳'];
    if (delegateKeywords.some((k) => message.includes(k))) return 'delegate';

    const planKeywords = ['安排', '计划', '规划', '排期', '组织'];
    if (planKeywords.some((k) => message.includes(k))) return 'plan';

    const analyzeKeywords = ['分析', '趋势', '对比', '总结', '建议', '预测', '统计', '分布'];
    if (analyzeKeywords.some((k) => message.includes(k))) return 'analyze';

    const knowledgeKeywords = ['知识库', '政策', '规定', '手册', '指南', '文档', '说明', '规则'];
    if (knowledgeKeywords.some((k) => message.includes(k))) return 'knowledge';

    const queryKeywords = ['查', '找', '事件', '日程', '哪', '有', '多少', '什么'];
    if (queryKeywords.some((k) => message.includes(k))) return 'query';

    // 用 LLM 做精确分类
    try {
      const result = await provider.generate({
        messages: [
          { role: 'system', content: INTENT_CLASSIFICATION_PROMPT },
          { role: 'user', content: message },
        ],
        model: model ?? provider.availableModels[0],
        maxTokens: 10,
        temperature: 0,
      });
      const intent = result.content.trim().toLowerCase() as Intent;
      if (['query', 'analyze', 'navigate', 'chat', 'plan', 'knowledge', 'delegate'].includes(intent)) {
        return intent;
      }
    } catch {}
    return 'chat';
  }
}
