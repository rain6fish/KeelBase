// SPDX-License-Identifier: Apache-2.0

/**
 * 创建项目任务工具 — create_project_task（写操作）
 *
 * 需人工确认（requiresConfirmation = true）+ 已验证邮箱。
 * 幂等与副作用撤销由 AiToolEffectsService 处理（resultType: pm_task，软删恢复）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface PmServiceLike {
  createTask(dto: { projectId: number; title: string; description?: string; dueDate?: string }, userId: number): Promise<{ id: number; title: string; projectId: number; dueDate?: Date | null }>;
}

export class CreateProjectTaskTool implements AiTool {
  readonly name = 'create_project_task';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description =
    '为项目创建任务（如跟进延期风险、分配工作项）。用户要求"给某项目创建/安排任务"时使用。' +
    '这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'projectId',
      type: 'number',
      description: '项目 id（来自 query_projects 返回）',
      required: true,
    },
    {
      name: 'title',
      type: 'string',
      description: '任务标题，如"跟进平台重构延期风险"',
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
      description: '截止日期，ISO 8601，如 2026-08-25T10:00:00Z（可选）',
      required: false,
    },
  ];

  constructor(private readonly pmService: PmServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            projectId: { type: 'number', description: '项目 id' },
            title: { type: 'string', description: '任务标题' },
            description: { type: 'string', description: '任务描述' },
            dueDate: { type: 'string', description: '截止日期 ISO 8601' },
          },
          required: ['projectId', 'title'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const projectId = Number(args.projectId);
      if (!Number.isFinite(projectId)) {
        return { success: false, error: 'projectId 必须是数字' };
      }
      const dto: { projectId: number; title: string; description?: string; dueDate?: string } = {
        projectId,
        title: String(args.title ?? ''),
        ...(args.description !== undefined ? { description: String(args.description) } : {}),
        ...(args.dueDate !== undefined ? { dueDate: String(args.dueDate) } : {}),
      };
      const task = await this.pmService.createTask(dto, Number(userId));
      return {
        success: true,
        data: { id: task.id, title: task.title, projectId: task.projectId, dueDate: task.dueDate ?? null },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
