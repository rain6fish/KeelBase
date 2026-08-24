/**
 * 销售管道分析工具 — analyze_sales_pipeline（只读，AI Sales Agent P0 §10）
 *
 * 聚合用户全部销售机会做管道分析（总金额/加权/阶段分布/快到期），LLM 生成自然语言洞察（降级结构化）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface OpportunityLike {
  name: string;
  amount: number;
  stage: string;
  probability: number;
  expectedCloseDate?: Date | null;
  customerId?: number;
}

interface CrmServiceLike {
  listAllOpportunities(userId: number): Promise<OpportunityLike[]>;
}

interface LlmGenerateLike {
  generate(p: { messages: Array<{ role: string; content: string }>; temperature?: number; maxTokens?: number }): Promise<{ content: string }>;
}

const OPEN_STAGES = new Set(['qualification', 'proposal', 'negotiation']);
const DAY_MS = 24 * 60 * 60 * 1000;

export class AnalyzeSalesPipelineTool implements AiTool {
  readonly name = 'analyze_sales_pipeline';
  readonly description =
    '分析销售管道（跨客户全部销售机会）：管道总金额 / 加权成交金额（金额×概率）/ 阶段分布 / 近 30 天快到期机会 / 已成交。' +
    '用户问"我的销售管道怎么样 / 这个月预计成交多少 / 哪些机会快到期 / 销售漏斗"时使用。只读，不写数据。';
  readonly parameters: ToolParameter[] = [];

  constructor(
    private readonly crmService: CrmServiceLike,
    private readonly providerFactory?: { getProvider(name: string): LlmGenerateLike },
    private readonly defaultProvider = 'deepseek',
  ) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: { name: this.name, description: this.description, parameters: { type: 'object', properties: {} } },
    };
  }

  async execute(_args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const opportunities = await this.crmService.listAllOpportunities(Number(userId));
      const open = opportunities.filter((o) => OPEN_STAGES.has(o.stage));
      const won = opportunities.filter((o) => o.stage === 'won');
      const lost = opportunities.filter((o) => o.stage === 'lost');

      const pipelineAmount = open.reduce((s, o) => s + o.amount, 0);
      const weightedAmount = open.reduce((s, o) => s + o.amount * (o.probability / 100), 0);
      const wonAmount = won.reduce((s, o) => s + o.amount, 0);

      const now = Date.now();
      const soon = open
        .filter((o) => o.expectedCloseDate && o.expectedCloseDate.getTime() - now <= 30 * DAY_MS && o.expectedCloseDate.getTime() >= now)
        .sort((a, b) => (a.expectedCloseDate!.getTime() - b.expectedCloseDate!.getTime()))
        .map((o) => ({ name: o.name, amount: o.amount, probability: o.probability, expectedCloseDate: o.expectedCloseDate }));

      const byStage: Record<string, { count: number; amount: number }> = {};
      for (const o of open) {
        byStage[o.stage] = byStage[o.stage] ?? { count: 0, amount: 0 };
        byStage[o.stage].count++;
        byStage[o.stage].amount += o.amount;
      }

      const structured = {
        totalOpportunities: opportunities.length,
        open: open.length,
        won: won.length,
        lost: lost.length,
        pipelineAmount: Math.round(pipelineAmount),
        weightedAmount: Math.round(weightedAmount),
        wonAmount: Math.round(wonAmount),
        byStage,
        soonClosing: soon,
      };

      let insight: string | null = null;
      try {
        if (this.providerFactory) {
          const provider = this.providerFactory.getProvider(this.defaultProvider);
          const res = await provider.generate({
            messages: [
              {
                role: 'system',
                content:
                  '你是企业销售助手。基于销售管道数据生成简洁中文洞察（≤120 字，分点）：管道健康度、快到期机会、建议优先跟进。',
              },
              { role: 'user', content: JSON.stringify(structured) },
            ],
            temperature: 0.3,
            maxTokens: 300,
          });
          insight = res.content?.trim() || null;
        }
      } catch {
        insight = null;
      }

      return { success: true, data: { insight, structured } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
