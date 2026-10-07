// SPDX-License-Identifier: Apache-2.0

/**
 * 查询供应商工具 — query_suppliers（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface SuppliersServiceLike {
  findAll(userId: number): Promise<any[]>;
}

export class QuerySuppliersTool implements AiTool {
  readonly name = 'query_suppliers';
  readonly description = '查询供应商列表（本人数据）。用户问"有哪些供应商"时使用。';
  readonly parameters: ToolParameter[] = [
    { name: 'keyword', type: 'string', description: '关键字（可选）', required: false },
  ];

  constructor(private readonly suppliersService: SuppliersServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
                type: 'object',
                properties: {
              name: { type: 'string', description: 'name' },
              contact: { type: 'string', description: 'contact' },
              status: { type: 'string', description: 'status' },
              riskLevel: { type: 'string', description: 'riskLevel' },
              annualSpend: { type: 'number', description: 'annualSpend' },
                },
              },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const items = await this.suppliersService.findAll(Number(userId));
      const data = items.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        o.name = item.name;
        o.contact = item.contact;
        o.status = item.status;
        o.riskLevel = item.riskLevel;
        o.annualSpend = item.annualSpend;
        return o;
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
