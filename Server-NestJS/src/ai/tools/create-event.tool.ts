// SPDX-License-Identifier: Apache-2.0

/**
 * 创建事件工具 — create_event
 *
 * 写操作：需用户人工确认后执行（requiresConfirmation = true）。
 * 服务端在流式对话中先发 confirmation_request，用户确认后才真正创建。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';
import { EventColorRole } from '../../events/event-color-role.enum';

interface EventsServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateEventTool implements AiTool {
  readonly name = 'create_event';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description =
    '创建事件（日程/会议/安排）。用户明确要求"添加/创建事件、日程、安排"时使用。' +
    '这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'title',
      type: 'string',
      description: '事件标题',
      required: true,
    },
    {
      name: 'startTime',
      type: 'string',
      description: '开始时间，ISO 8601，如 2026-08-10T09:00:00Z',
      required: true,
    },
    {
      name: 'endTime',
      type: 'string',
      description: '结束时间，ISO 8601，如 2026-08-10T10:00:00Z',
      required: true,
    },
    {
      name: 'description',
      type: 'string',
      description: '事件描述（可选）',
      required: false,
    },
    {
      name: 'location',
      type: 'string',
      description: '地点（可选）',
      required: false,
    },
    {
      name: 'colorRole',
      type: 'string',
      description: '颜色角色（可选）',
      required: false,
      enum: Object.values(EventColorRole) as string[],
    },
    {
      name: 'isRecurring',
      type: 'boolean',
      description: '是否重复事件（可选）',
      required: false,
    },
    {
      name: 'reminderMinutes',
      type: 'number',
      description: '提前 N 分钟提醒（可选）',
      required: false,
    },
  ];

  constructor(private readonly eventsService: EventsServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '事件标题' },
            startTime: { type: 'string', description: '开始时间 ISO 8601' },
            endTime: { type: 'string', description: '结束时间 ISO 8601' },
            description: { type: 'string', description: '事件描述' },
            location: { type: 'string', description: '地点' },
            colorRole: {
              type: 'string',
              enum: Object.values(EventColorRole),
              description: '颜色角色',
            },
            isRecurring: { type: 'boolean', description: '是否重复事件' },
            reminderMinutes: { type: 'number', description: '提前提醒分钟数' },
          },
          required: ['title', 'startTime', 'endTime'],
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
      for (const key of [
        'title',
        'description',
        'startTime',
        'endTime',
        'location',
        'colorRole',
        'isRecurring',
        'reminderMinutes',
      ] as const) {
        if (args[key] !== undefined) {
          dto[key] = args[key];
        }
      }

      const event = await this.eventsService.create(dto, Number(userId));
      return {
        success: true,
        data: { id: event.id, title: event.title, startTime: event.startTime },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
