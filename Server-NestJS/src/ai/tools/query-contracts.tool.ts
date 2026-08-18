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
              name: { type: 'string', description: 'name' },
              counterparty: { type: 'string', description: 'counterparty' },
              status: { type: 'string', description: 'status' },
              amount: { type: 'number', description: 'amount' },
                },
              },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const items = await this.contractsService.findAll(Number(userId));
      const data = items.map((item) => {
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
