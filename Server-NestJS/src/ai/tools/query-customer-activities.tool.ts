// SPDX-License-Identifier: Apache-2.0

/**
 * 查询客户跟进记录工具 — query_customer_activities（只读）
 *
 * 按 userId 限定数据范围；customerId 必须是本人客户。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface CrmServiceLike {
  listActivities(customerId: number, userId: number): Promise<any[]>;
}

export class QueryCustomerActivitiesTool implements AiTool {
  readonly name = 'query_customer_activities';
  readonly description =
    '查询某客户的跟进记录（电话/会议/邮件/备注）。了解客户最近互动情况时使用。';
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
      const activities = await this.crmService.listActivities(customerId, Number(userId));
      return {
        success: true,
        data: activities.map((a) => ({
          id: a.id,
          type: a.type,
          summary: a.summary,
          happenedAt: a.happenedAt,
        })),
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
