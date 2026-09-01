// SPDX-License-Identifier: Apache-2.0

/**
 * 客户风险分析工具 — analyze_customer_risk（只读）
 *
 * 综合逾期订单/高价值订单/逾期任务/未解决风险/客户状态，输出风险等级 + 理由。
 * 旗舰演示「找出风险最高客户并创建跟进任务」的核心分析步骤。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface CrmServiceLike {
  analyzeRisk(
    customerId: number,
    userId: number,
  ): Promise<{ level: string; score: number; reasons: string[]; dataPoints: Record<string, unknown> }>;
}

export class AnalyzeCustomerRiskTool implements AiTool {
  readonly name = 'analyze_customer_risk';
  readonly description =
    '分析客户风险等级（low/medium/high/critical）：综合逾期订单、高价值订单、逾期未完成跟进任务、未解决风险记录与客户状态。用户问"哪些客户值得跟进/风险最高/该重点关注谁"时，先 query_customers 拿客户列表，再对候选客户逐个调用本工具。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'customerId',
      type: 'number',
      description: '客户 id（来自 query_customers 返回）',
      required: true,
    },
  ];

  constructor(private readonly crmService: CrmServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: { customerId: { type: 'number', description: '客户 id' } },
          required: ['customerId'],
        },
      },
    };
  }

  async execute(
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    try {
      const customerId = Number(args.customerId);
      if (!Number.isFinite(customerId)) {
        return { success: false, error: 'customerId 必须是数字' };
      }
      const result = await this.crmService.analyzeRisk(customerId, Number(userId));
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
