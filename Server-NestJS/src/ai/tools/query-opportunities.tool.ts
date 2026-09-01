// SPDX-License-Identifier: Apache-2.0

/**
 * 查询客户销售机会工具 — query_customer_opportunities（只读，Customer 360 P0 §10）
 *
 * 按 userId 限定数据范围；customerId 必须是本人客户。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface CrmServiceLike {
  listOpportunities(customerId: number, userId: number): Promise<any[]>;
}

export class QueryCustomerOpportunitiesTool implements AiTool {
  readonly name = 'query_customer_opportunities';
  readonly description =
    '查询某客户的销售机会列表（名称/金额/阶段/成交概率/预期成交日）。销售分析时用——如"这个客户有哪些在谈机会"、判断客户销售潜力/续约扩增。';
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
      const items = await this.crmService.listOpportunities(customerId, Number(userId));
      return {
        success: true,
        data: {
          items,
          total: items.length,
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
