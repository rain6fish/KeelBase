// SPDX-License-Identifier: Apache-2.0

/**
 * 建项目并拆任务 — create_project_with_tasks（复合写操作，docs/cascade-compensation.spec.md）
 *
 * **第一个跨表复合写工具**：一次调用写 `pm_projects` + N × `pm_tasks`，两条链路因而可被检验：
 * - 写入侧：PmService 单事务（不留「有项目没任务」的半成品）
 * - 撤销侧：副作用按补偿组登记，撤销**任一条**即级联补偿整组（一次业务动作一次补偿）
 *
 * 声明方式：`ToolResult.data.effects`（根成员 = 项目，恒为第 0 条）。
 * 幂等与副作用登记由 AiToolEffectsService.recordGroup 处理。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface PmServiceLike {
  createProjectWithTasks(
    dto: { name: string; description?: string; startDate?: string; endDate?: string },
    taskDtos: Array<{ title: string; description?: string; dueDate?: string }>,
    userId: number,
  ): Promise<{
    project: { id: number; name: string };
    tasks: Array<{ id: number; title: string }>;
  }>;
}

export class CreateProjectWithTasksTool implements AiTool {
  readonly name = 'create_project_with_tasks';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description =
    '创建一个项目并同时拆解出若干任务（如"新建 XX 项目并列出启动阶段的任务"）。' +
    '用户一次性要求"建项目 + 排任务"时使用。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'name',
      type: 'string',
      description: '项目名称，如"客户门户二期"',
      required: true,
    },
    {
      name: 'description',
      type: 'string',
      description: '项目描述（可选）',
      required: false,
    },
    {
      name: 'startDate',
      type: 'string',
      description: '开始日期，ISO 8601（可选）',
      required: false,
    },
    {
      name: 'endDate',
      type: 'string',
      description: '截止日期，ISO 8601（可选）',
      required: false,
    },
    {
      name: 'tasks',
      type: 'array',
      description: '要一并创建的任务列表，每项 {title, description?, dueDate?}',
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
          properties: {
            name: { type: 'string', description: '项目名称' },
            description: { type: 'string', description: '项目描述' },
            startDate: { type: 'string', description: '开始日期 ISO 8601' },
            endDate: { type: 'string', description: '截止日期 ISO 8601' },
            tasks: {
              type: 'array',
              description: '要一并创建的任务列表',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '任务标题' },
                  description: { type: 'string', description: '任务描述' },
                  dueDate: { type: 'string', description: '截止日期 ISO 8601' },
                },
                required: ['title'],
              },
            },
          },
          required: ['name', 'tasks'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const name = String(args.name ?? '').trim();
      if (!name) return { success: false, error: 'name 必填' };

      // tasks 是必填声明项：非法值**报错**而非静默当空数组——否则用户要的是「建项目+排任务」，
      // 拿到的却是个裸项目且毫无信号（fail-closed 优于静默降级）
      if (!Array.isArray(args.tasks)) {
        return { success: false, error: 'tasks 必须是数组（无任务时传空数组）' };
      }
      const rawTasks = args.tasks;
      const taskDtos: Array<{ title: string; description?: string; dueDate?: string }> = [];
      for (const raw of rawTasks) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          return { success: false, error: 'tasks 每一项都必须是对象' };
        }
        const t = raw as Record<string, unknown>;
        const title = String(t.title ?? '').trim();
        if (!title) return { success: false, error: 'tasks 每一项都需要 title' };
        taskDtos.push({
          title,
          ...(t.description !== undefined ? { description: String(t.description) } : {}),
          ...(t.dueDate !== undefined ? { dueDate: String(t.dueDate) } : {}),
        });
      }

      const dto: { name: string; description?: string; startDate?: string; endDate?: string } = {
        name,
        ...(args.description !== undefined ? { description: String(args.description) } : {}),
        ...(args.startDate !== undefined ? { startDate: String(args.startDate) } : {}),
        ...(args.endDate !== undefined ? { endDate: String(args.endDate) } : {}),
      };
      const { project, tasks } = await this.pmService.createProjectWithTasks(
        dto,
        taskDtos,
        Number(userId),
      );

      return {
        success: true,
        data: {
          id: project.id,
          name: project.name,
          taskCount: tasks.length,
          // 复合写副作用声明（docs/cascade-compensation.spec.md §3）：根成员（项目）恒为第 0 条
          effects: [
            { resultType: 'pm_project', resultId: project.id },
            ...tasks.map((t) => ({ resultType: 'pm_task', resultId: t.id })),
          ],
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
