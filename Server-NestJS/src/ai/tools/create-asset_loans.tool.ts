// SPDX-License-Identifier: Apache-2.0

/**
 * 创建资产借用工具 — create_asset_loan（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: asset_loan）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface AssetLoansServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateAssetLoanTool implements AiTool {
  readonly name = 'create_asset_loan';
  readonly riskLevel = 'R3';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建资产借用（设备名称、资产编号、借用事由、计划归还日、状态）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'assetName', type: 'string', description: '设备名称', required: true },
    { name: 'assetTag', type: 'string', description: '资产编号', required: true },
    { name: 'purpose', type: 'string', description: '借用事由', required: false },
    { name: 'dueDate', type: 'string', description: '计划归还日', required: false },
    { name: 'status', type: 'string', description: '状态', required: false,
      enum: ['active', 'returned', 'overdue'] },
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
            assetName: { type: 'string', description: '设备名称' },
            assetTag: { type: 'string', description: '资产编号' },
            purpose: { type: 'string', description: '借用事由' },
            dueDate: { type: 'string', description: '计划归还日' },
            status: { type: 'string', description: '状态', enum: ['active', 'returned', 'overdue'] },
          },
          required: ['assetName', 'assetTag'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
        if (args.assetName !== undefined) dto.assetName = args.assetName as any;
        if (args.assetTag !== undefined) dto.assetTag = args.assetTag as any;
        if (args.purpose !== undefined) dto.purpose = args.purpose as any;
        if (args.dueDate !== undefined) dto.dueDate = args.dueDate as any;
        if (args.status !== undefined) dto.status = args.status as any;
      const entity = await this.asset_loansService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, assetName: entity.assetName } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
