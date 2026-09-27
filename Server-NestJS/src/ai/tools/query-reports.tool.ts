// SPDX-License-Identifier: Apache-2.0

/**
 * 查询报告工具 — query_reports（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface ReportsServiceLike {
  findAll(userId: number): Promise<any[]>;
}

export class QueryReportsTool implements AiTool {
  readonly name = 'query_reports';
  readonly description = '查询报告列表（本人数据）。用户问"有哪些报告"时使用。';
  readonly parameters: ToolParameter[] = [
    { name: 'keyword', type: 'string', description: '关键字（可选）', required: false },
  ];

  constructor(private readonly reportsService: ReportsServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
                type: 'object',
                properties: {
              title: { type: 'string', description: 'title' },
              summary: { type: 'string', description: 'summary' },
              status: { type: 'string', description: 'status' },
              amount: { type: 'number', description: 'amount' },
                },
              },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const items = await this.reportsService.findAll(Number(userId));
      const data = items.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        o.title = item.title;
        o.summary = item.summary;
        o.status = item.status;
        o.amount = item.amount;
        return o;
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
