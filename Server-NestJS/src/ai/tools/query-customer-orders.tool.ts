// SPDX-License-Identifier: Apache-2.0

/**
 * 查询客户订单工具 — query_customer_orders（只读）
 *
 * 按 userId 限定数据范围；customerId 必须是本人客户。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface CrmServiceLike {
  listOrders(customerId: number, userId: number): Promise<any[]>;
}

export class QueryCustomerOrdersTool implements AiTool {
  readonly name = 'query_customer_orders';
  readonly description =
    '查询某客户的订单列表（金额/状态/下单/到期）。分析客户价值或逾期风险时配合 analyze_customer_risk 使用。';
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
      const orders = await this.crmService.listOrders(customerId, Number(userId));
      return {
        success: true,
        data: orders.map((o) => ({
          id: o.id,
          amount: o.amount,
          status: o.status,
          orderDate: o.orderDate,
          dueDate: o.dueDate,
        })),
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
