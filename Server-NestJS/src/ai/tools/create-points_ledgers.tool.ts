// SPDX-License-Identifier: Apache-2.0

/**
 * 创建积分台账工具 — create_points_ledger（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: points_ledger）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface PointsLedgersServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreatePointsLedgerTool implements AiTool {
  readonly name = 'create_points_ledger';
  readonly riskLevel = 'R3';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建积分台账（积分、签到日期、流水原因、说明）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'points', type: 'number', description: '积分', required: true },
    { name: 'checkinDate', type: 'string', description: '签到日期', required: false },
    { name: 'reason', type: 'string', description: '流水原因', required: true,
      enum: ['checkin', 'achievement', 'bonus', 'admin_adjust'] },
    { name: 'description', type: 'string', description: '说明', required: false },
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
            points: { type: 'number', description: '积分' },
            checkinDate: { type: 'string', description: '签到日期' },
            reason: { type: 'string', description: '流水原因', enum: ['checkin', 'achievement', 'bonus', 'admin_adjust'] },
            description: { type: 'string', description: '说明' },
          },
          required: ['points', 'reason'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
        if (args.points !== undefined) dto.points = args.points as any;
        if (args.checkinDate !== undefined) dto.checkinDate = args.checkinDate as any;
        if (args.reason !== undefined) dto.reason = args.reason as any;
        if (args.description !== undefined) dto.description = args.description as any;
      const entity = await this.points_ledgersService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, points: entity.points } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
