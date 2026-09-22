// SPDX-License-Identifier: Apache-2.0

/**
 * 查询客户工具 — query_customers（只读）
 *
 * 按 userId 限定数据范围：只能查本人客户。支持状态/风险等级/关键词筛选。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';
// 词汇从实体取，不在工具里重抄：工具声明的是「模型可以传什么」，那就是领域词汇表的第二份拷贝——
// 实体那边加一个状态，模型这边就会静默地继续收旧集合。（codebase-health-audit M4）
import { CUSTOMER_STATUSES, RISK_LEVELS } from '../../crm/crm-customer.entity';

interface CrmServiceLike {
  listCustomers(
    userId: number,
    filter: { status?: string; riskLevel?: string; keyword?: string },
  ): Promise<{ items: any[]; total: number }>;
}

export class QueryCustomersTool implements AiTool {
  readonly name = 'query_customers';
  readonly description =
    '查询客户列表（可按状态/风险等级/关键词筛选）。用户问"有哪些客户 / 我的客户 / 高风险客户 / 待跟进客户"时使用。返回客户 id、名称、公司、状态、风险等级。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'status',
      type: 'string',
      description: '客户状态：lead（潜在）/ active（合作中）/ churn_risk（流失风险）/ inactive（已停止）（可选）',
      required: false,
      enum: [...CUSTOMER_STATUSES],
    },
    {
      name: 'riskLevel',
      type: 'string',
      description: '风险等级：low / medium / high / critical（可选）',
      required: false,
      enum: [...RISK_LEVELS],
    },
    {
      name: 'keyword',
      type: 'string',
      description: '按名称/公司/邮箱关键词搜索（可选）',
      required: false,
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
            status: { type: 'string', enum: [...CUSTOMER_STATUSES], description: '客户状态' },
            riskLevel: { type: 'string', enum: [...RISK_LEVELS], description: '风险等级' },
            keyword: { type: 'string', description: '关键词' },
          },
        },
      },
    };
  }

  async execute(
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    try {
      const result = await this.crmService.listCustomers(Number(userId), {
        status: args.status as string | undefined,
        riskLevel: args.riskLevel as string | undefined,
        keyword: args.keyword as string | undefined,
      });
      const items = result.items.map((c) => ({
        id: c.id,
        name: c.name,
        company: c.company ?? null,
        status: c.status,
        riskLevel: c.riskLevel,
        email: c.email ?? null,
      }));
      return { success: true, data: { total: result.total, items } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
