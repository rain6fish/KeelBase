// SPDX-License-Identifier: Apache-2.0

/**
 * 查询资产借用工具 — query_asset_loans（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface AssetLoansServiceLike {
  findAll(userId: number, q?: string): Promise<any[]>;
}

export class QueryAssetLoansTool implements AiTool {
  readonly name = 'query_asset_loans';
  readonly description = '查询资产借用列表（本人数据）。用户问"有哪些资产借用"时使用。';
  readonly parameters: ToolParameter[] = [
    { name: 'keyword', type: 'string', description: '关键字（可选）', required: false },
  ];

  constructor(private readonly asset_loansService: AssetLoansServiceLike) {}

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
      const items = await this.asset_loansService.findAll(Number(userId), keyword);
      const data = items.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        o.assetName = item.assetName;
        o.assetTag = item.assetTag;
        o.purpose = item.purpose;
        o.dueDate = item.dueDate;
        o.status = item.status;
        return o;
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
