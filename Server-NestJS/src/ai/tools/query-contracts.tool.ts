/**
 * 查询合同工具 — query_contracts（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface ContractsServiceLike {
  findAll(userId: number): Promise<any[]>;
}

export class QueryContractsTool implements AiTool {
  readonly name = 'query_contracts';
  readonly description = '查询合同列表（本人数据）。用户问"有哪些合同"时使用。';
  readonly parameters: ToolParameter[] = [
    { name: 'keyword', type: 'string', description: '关键字（可选）', required: false },
  ];

  constructor(private readonly contractsService: ContractsServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
                type: 'object',
                properties: {
              keyword: { type: 'string', description: '关键字（可选，按名称/对方/状态过滤）' },
                },
              },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const keyword = typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : '';
      const items = await this.contractsService.findAll(Number(userId));
      const filtered = keyword
        ? items.filter((i) =>
            [i.name, i.counterparty, i.status].some(
              (v) => typeof v === 'string' && v.toLowerCase().includes(keyword),
            ),
          )
        : items;
      const data = filtered.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        o.name = item.name;
        o.counterparty = item.counterparty;
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
