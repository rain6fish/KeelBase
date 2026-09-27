// SPDX-License-Identifier: Apache-2.0

/**
 * 创建跟进计划工具 — create_followup_plan（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: followup_plan）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface FollowupPlansServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateFollowupPlanTool implements AiTool {
  readonly name = 'create_followup_plan';
  readonly riskLevel = 'R3';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建跟进计划（title、priority、reason、dueDate、status）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'title', type: 'string', description: 'title', required: true },
    { name: 'priority', type: 'string', description: 'priority', required: false,
      enum: ['low', 'medium', 'high', 'critical'] },
    { name: 'reason', type: 'string', description: 'reason', required: false },
    { name: 'dueDate', type: 'string', description: 'dueDate', required: false },
    { name: 'status', type: 'string', description: 'status', required: false,
      enum: ['planned', 'done', 'cancelled'] },
  ];

  constructor(private readonly followup_plansService: FollowupPlansServiceLike) {}

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
            priority: { type: 'string', description: 'priority', enum: ['low', 'medium', 'high', 'critical'] },
            reason: { type: 'string', description: 'reason' },
            dueDate: { type: 'string', description: 'dueDate' },
            status: { type: 'string', description: 'status', enum: ['planned', 'done', 'cancelled'] },
          },
          required: ['title'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
        if (args.title !== undefined) dto.title = args.title as any;
        if (args.priority !== undefined) dto.priority = args.priority as any;
        if (args.reason !== undefined) dto.reason = args.reason as any;
        if (args.dueDate !== undefined) dto.dueDate = args.dueDate as any;
        if (args.status !== undefined) dto.status = args.status as any;
      const entity = await this.followup_plansService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, title: entity.title } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
