// SPDX-License-Identifier: Apache-2.0

/**
 * 创建供应商工具 — create_supplier（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: supplier）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface SuppliersServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateSupplierTool implements AiTool {
  readonly name = 'create_supplier';
  readonly riskLevel = 'R3';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建供应商（name、contact、status、riskLevel、annualSpend）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'name', type: 'string', description: 'name', required: true },
    { name: 'contact', type: 'string', description: 'contact', required: false },
    { name: 'status', type: 'string', description: 'status', required: false,
      enum: ['active', 'inactive', 'blacklist'] },
    { name: 'riskLevel', type: 'string', description: 'riskLevel', required: false,
      enum: ['low', 'medium', 'high'] },
    { name: 'annualSpend', type: 'number', description: 'annualSpend', required: false },
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
            status: { type: 'string', description: 'status', enum: ['active', 'inactive', 'blacklist'] },
            riskLevel: { type: 'string', description: 'riskLevel', enum: ['low', 'medium', 'high'] },
            annualSpend: { type: 'number', description: 'annualSpend' },
          },
          required: ['name'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
        if (args.name !== undefined) dto.name = args.name as any;
        if (args.contact !== undefined) dto.contact = args.contact as any;
        if (args.status !== undefined) dto.status = args.status as any;
        if (args.riskLevel !== undefined) dto.riskLevel = args.riskLevel as any;
        if (args.annualSpend !== undefined) dto.annualSpend = args.annualSpend as any;
      const entity = await this.suppliersService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, name: entity.name } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
