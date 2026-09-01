// SPDX-License-Identifier: Apache-2.0

/**
 * 创建合同工具 — create_contract（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: contract）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface ContractsServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateContractTool implements AiTool {
  readonly name = 'create_contract';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建合同（name、counterparty、status、amount）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'name', type: 'string', description: 'name', required: true },
    { name: 'counterparty', type: 'string', description: 'counterparty', required: true },
    { name: 'status', type: 'string', description: 'status', required: false,
      enum: ['draft', 'reviewing', 'active', 'expired', 'terminated'] },
    { name: 'amount', type: 'number', description: 'amount', required: false },
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
            status: { type: 'string', description: 'status', enum: ['draft', 'reviewing', 'active', 'expired', 'terminated'] },
            amount: { type: 'number', description: 'amount' },
          },
          required: ['name', 'counterparty'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
        if (args.name !== undefined) dto.name = args.name as any;
        if (args.counterparty !== undefined) dto.counterparty = args.counterparty as any;
        if (args.status !== undefined) dto.status = args.status as any;
        if (args.amount !== undefined) dto.amount = args.amount as any;
      const entity = await this.contractsService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, name: entity.name } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
