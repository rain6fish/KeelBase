/**
 * 创建待办工具 — create_todo
 *
 * 写操作：需用户人工确认后执行（requiresConfirmation = true）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface TodosServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateTodoTool implements AiTool {
  readonly name = 'create_todo';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description =
    '创建待办。用户明确要求"添加/创建待办、任务、TODO"时使用。' +
    '这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'title',
      type: 'string',
      description: '待办标题',
      required: true,
    },
    {
      name: 'description',
      type: 'string',
      description: '待办描述（可选）',
      required: false,
    },
    {
      name: 'dueDate',
      type: 'string',
      description: '截止时间，ISO 8601（可选）',
      required: false,
    },
    {
      name: 'completed',
      type: 'boolean',
      description: '是否已完成（可选，默认 false）',
      required: false,
    },
  ];

  constructor(private readonly todosService: TodosServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '待办标题' },
            description: { type: 'string', description: '待办描述' },
            dueDate: { type: 'string', description: '截止时间 ISO 8601' },
            completed: { type: 'boolean', description: '是否已完成' },
          },
          required: ['title'],
        },
      },
    };
  }

  async execute(
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
      for (const key of ['title', 'description', 'dueDate', 'completed'] as const) {
        if (args[key] !== undefined) {
          dto[key] = args[key];
        }
      }

      const todo = await this.todosService.create(dto, Number(userId));
      return {
        success: true,
        data: { id: todo.id, title: todo.title },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
