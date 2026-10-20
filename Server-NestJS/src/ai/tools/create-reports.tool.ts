// SPDX-License-Identifier: Apache-2.0

/**
 * 创建报告工具 — create_report（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: report）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface ReportsServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateReportTool implements AiTool {
  readonly name = 'create_report';
  readonly riskLevel = 'R3';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建报告（标题、摘要、状态、金额）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'title', type: 'string', description: '标题', required: true },
    { name: 'summary', type: 'string', description: '摘要', required: false },
    { name: 'status', type: 'string', description: '状态', required: true,
      enum: ['draft', 'published'] },
    { name: 'amount', type: 'number', description: '金额', required: false },
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
            title: { type: 'string', description: '标题' },
            summary: { type: 'string', description: '摘要' },
            status: { type: 'string', description: '状态', enum: ['draft', 'published'] },
            amount: { type: 'number', description: '金额' },
          },
          required: ['title', 'status'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
        if (args.title !== undefined) dto.title = args.title as any;
        if (args.summary !== undefined) dto.summary = args.summary as any;
        if (args.status !== undefined) dto.status = args.status as any;
        if (args.amount !== undefined) dto.amount = args.amount as any;
      const entity = await this.reportsService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, title: entity.title } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
