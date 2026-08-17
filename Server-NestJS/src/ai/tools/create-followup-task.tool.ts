/**
 * 创建跟进任务工具 — create_followup_task（写操作）
 *
 * 需人工确认（requiresConfirmation = true）+ 已验证邮箱。
 * 幂等与副作用撤销由 AiToolEffectsService 处理（resultType: crm_task，软删恢复）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface CrmServiceLike {
  createTask(
    dto: { customerId?: number; title: string; description?: string; dueDate?: string },
    userId: number,
  ): Promise<{ id: number; title: string; customerId?: number | null; dueDate?: Date | null }>;
}

export class CreateFollowupTaskTool implements AiTool {
  readonly name = 'create_followup_task';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description =
    '为客户创建跟进任务（如提醒销售跟进、催款、回访）。用户要求"创建/安排跟进任务、给某客户定个任务"时使用。' +
    '这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'customerId',
      type: 'number',
      description: '关联客户 id（来自 query_customers 返回）',
      required: true,
    },
    {
      name: 'title',
      type: 'string',
      description: '任务标题，如"跟进华润订单逾期问题"',
      required: true,
    },
    {
      name: 'description',
      type: 'string',
      description: '任务描述/原因（可选）',
      required: false,
    },
    {
      name: 'dueDate',
      type: 'string',
      description: '截止日期，ISO 8601，如 2026-08-20T10:00:00Z（可选）',
      required: false,
    },
  ];

  constructor(private readonly crmService: CrmServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            customerId: { type: 'number', description: '客户 id' },
            title: { type: 'string', description: '任务标题' },
            description: { type: 'string', description: '任务描述' },
            dueDate: { type: 'string', description: '截止日期 ISO 8601' },
          },
          required: ['customerId', 'title'],
        },
      },
    };
  }

  async execute(
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    try {
      const customerId = args.customerId !== undefined ? Number(args.customerId) : undefined;
      const dto: { customerId?: number; title: string; description?: string; dueDate?: string } = {
        title: String(args.title ?? ''),
        ...(customerId !== undefined && Number.isFinite(customerId) ? { customerId } : {}),
        ...(args.description !== undefined ? { description: String(args.description) } : {}),
        ...(args.dueDate !== undefined ? { dueDate: String(args.dueDate) } : {}),
      };
      const task = await this.crmService.createTask(dto, Number(userId));
      return {
        success: true,
        data: { id: task.id, title: task.title, customerId: task.customerId ?? null, dueDate: task.dueDate ?? null },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
