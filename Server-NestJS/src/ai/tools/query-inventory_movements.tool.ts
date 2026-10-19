// SPDX-License-Identifier: Apache-2.0

/**
 * 查询库存出入库工具 — query_inventory_movements（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface InventoryMovementsServiceLike {
  findAll(userId: number, q?: string): Promise<any[]>;
}

export class QueryInventoryMovementsTool implements AiTool {
  readonly name = 'query_inventory_movements';
  readonly description = '查询库存出入库列表（本人数据）。用户问"有哪些库存出入库"时使用。';
  readonly parameters: ToolParameter[] = [
    { name: 'keyword', type: 'string', description: '关键字（可选）', required: false },
  ];

  constructor(private readonly inventory_movementsService: InventoryMovementsServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '关键字（可选）' },
          },
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const keyword = typeof args.keyword === 'string' ? args.keyword : undefined;
      const items = await this.inventory_movementsService.findAll(Number(userId), keyword);
      const data = items.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        o.documentNo = item.documentNo;
        o.sku = item.sku;
        o.itemName = item.itemName;
        o.direction = item.direction;
        o.quantity = item.quantity;
        o.unit = item.unit;
        o.partner = item.partner;
        o.occurredAt = item.occurredAt;
        o.note = item.note;
        return o;
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
