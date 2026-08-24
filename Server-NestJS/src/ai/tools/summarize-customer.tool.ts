/**
 * 客户 360 全景摘要工具 — summarize_customer_360（只读，Customer 360 P0 §10）
 *
 * AI 理解业务：聚合客户全景（资料/订单/跟进/任务/风险/销售机会），用 LLM 生成自然语言摘要。
 * LLM 不可用时降级返回结构化全景（不崩，AI 仍能基于结构化数据回答）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface Crm360Data {
  customer: { name: string; status?: string; riskLevel?: string } | null;
  orders: Array<{ amount: number; status: string }>;
  activities: unknown[];
  tasks: Array<{ status?: string }>;
  risks: Array<{ level?: string; resolvedAt?: Date | null }>;
  opportunities: Array<{ name: string; amount: number; stage: string; probability: number }>;
}

interface CrmServiceLike {
  getCustomer360Data(customerId: number, userId: number): Promise<Crm360Data>;
}

interface LlmGenerateLike {
  generate(p: { messages: Array<{ role: string; content: string }>; temperature?: number; maxTokens?: number }): Promise<{ content: string }>;
}

export class SummarizeCustomerTool implements AiTool {
  readonly name = 'summarize_customer_360';
  readonly description =
    '生成客户 360 全景摘要（AI 理解业务）：聚合客户资料/订单/跟进/风险/销售机会，生成自然语言摘要（概况/风险/在谈机会/建议下一步）。' +
    '用户问"总结/概览一下这个客户、这个客户什么情况"时使用。只读，不写数据。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'customerId',
      type: 'number',
      description: '客户 id（来自 query_customers 返回）',
      required: true,
    },
  ];

  constructor(
    private readonly crmService: CrmServiceLike,
    private readonly providerFactory?: { getProvider(name: string): LlmGenerateLike },
    private readonly defaultProvider = 'deepseek',
  ) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            customerId: { type: 'number', description: '客户 id（来自 query_customers 返回）' },
          },
          required: ['customerId'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const customerId = Number(args.customerId);
      if (!Number.isFinite(customerId)) {
        return { success: false, error: 'customerId 必须是数字' };
      }
      const data = await this.crmService.getCustomer360Data(customerId, Number(userId));
      if (!data.customer) {
        return { success: false, error: '客户不存在或无权访问' };
      }

      // 结构化全景（LLM 不可用时兜底）
      const structured = {
        customer: data.customer.name,
        status: data.customer.status ?? null,
        riskLevel: data.customer.riskLevel ?? null,
        orders: data.orders.length,
        overdueOrders: data.orders.filter((o) => o.status === 'overdue').length,
        activities: data.activities.length,
        openTasks: data.tasks.filter((t) => t.status !== 'completed').length,
        openRisks: data.risks.filter((r) => !r.resolvedAt).length,
        opportunities: data.opportunities.map((o) => ({
          name: o.name,
          amount: o.amount,
          stage: o.stage,
          probability: o.probability,
        })),
      };

      // LLM 生成自然语言摘要（失败降级结构化）
      let summary: string | null = null;
      try {
        if (this.providerFactory) {
          const provider = this.providerFactory.getProvider(this.defaultProvider);
          const res = await provider.generate({
            messages: [
              {
                role: 'system',
                content:
                  '你是企业销售助手。基于客户数据生成简洁中文摘要：客户概况、风险、在谈机会、建议下一步（≤120 字，分点）。',
              },
              { role: 'user', content: JSON.stringify(structured) },
            ],
            temperature: 0.3,
            maxTokens: 300,
          });
          summary = res.content?.trim() || null;
        }
      } catch {
        summary = null; // LLM 不可用 → 降级结构化
      }

      return { success: true, data: { summary, structured } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
