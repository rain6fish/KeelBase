// SPDX-License-Identifier: Apache-2.0

/**
 * 查询积分台账工具 — query_points_ledgers（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface PointsLedgersServiceLike {
  findAll(userId: number, q?: string): Promise<any[]>;
}

export class QueryPointsLedgersTool implements AiTool {
  readonly name = 'query_points_ledgers';
  readonly description = '查询积分台账列表（本人数据）。用户问"有哪些积分台账"时使用。';
  readonly parameters: ToolParameter[] = [
    { name: 'keyword', type: 'string', description: '关键字（可选）', required: false },
  ];

  constructor(private readonly points_ledgersService: PointsLedgersServiceLike) {}

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
      const items = await this.points_ledgersService.findAll(Number(userId), keyword);
      const data = items.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        o.points = item.points;
        o.checkinDate = item.checkinDate;
        o.reason = item.reason;
        o.description = item.description;
        return o;
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
