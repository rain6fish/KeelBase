/**
 * 查询客户联系人工具 — query_customer_contacts（只读，Customer 360 P0 §10）
 *
 * 按 userId 限定数据范围；customerId 必须是本人客户。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface CrmServiceLike {
  listContacts(customerId: number, userId: number): Promise<any[]>;
}

export class QueryCustomerContactsTool implements AiTool {
  readonly name = 'query_customer_contacts';
  readonly description =
    '查询某客户的联系人列表（姓名/邮箱/电话/角色/部门/是否主联系人）。销售触达时用——如"这个客户找谁对接""有没有决策人"。';
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
      const items = await this.crmService.listContacts(customerId, Number(userId));
      return { success: true, data: { items, total: items.length } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
