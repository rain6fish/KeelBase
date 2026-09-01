// SPDX-License-Identifier: Apache-2.0

/**
 * 查询项目任务工具 — query_project_tasks（只读）
 *
 * 按 userId 限定数据范围；projectId 必须是本人项目。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface PmServiceLike {
  listTasks(userId: number, projectId?: number): Promise<{ items: any[]; total: number }>;
}

export class QueryProjectTasksTool implements AiTool {
  readonly name = 'query_project_tasks';
  readonly description =
    '查询某项目的任务列表（状态/截止日期）。分析项目进度或延期风险时配合 analyze_project_risk 使用。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'projectId',
      type: 'number',
      description: '项目 id（来自 query_projects 返回）',
      required: true,
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
          properties: { projectId: { type: 'number', description: '项目 id' } },
          required: ['projectId'],
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
      const result = await this.pmService.listTasks(Number(userId), projectId);
      return {
        success: true,
        data: result.items.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          dueDate: t.dueDate ?? null,
          assigneeId: t.assigneeId ?? null,
        })),
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
