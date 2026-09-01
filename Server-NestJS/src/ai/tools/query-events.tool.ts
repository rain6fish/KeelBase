// SPDX-License-Identifier: Apache-2.0

/**
 * 事件查询工具 — query_events
 *
 * 按日期范围查询当前用户的事件列表。
 */

import { AiTool, ToolDefinition, ToolResult } from '../interfaces/tool.interface';
import { ToolParameter } from '../interfaces/tool.interface';

interface EventsServiceLike {
  getEventsForRange(start: string, end: string, userId?: number): Promise<any[]>;
}

export class QueryEventsTool implements AiTool {
  readonly name = 'query_events';
  readonly description = '查询用户的事件列表（日程/任务/安排），可按日期范围、状态筛选。如果用户没有指定日期，默认查本月（从本月1日到今天）。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'startDate',
      type: 'string',
      description: '开始日期，格式 YYYY-MM-DD。如果用户未指定，默认本月的第一天',
      required: false,
    },
    {
      name: 'endDate',
      type: 'string',
      description: '结束日期，格式 YYYY-MM-DD。如果用户未指定，默认今天',
      required: false,
    },
    {
      name: 'status',
      type: 'string',
      description: '事件状态筛选：active（进行中）、cancelled（已取消）、completed（已完成），不传返回全部',
      required: false,
      enum: ['active', 'cancelled', 'completed'],
    },
    {
      name: 'limit',
      type: 'number',
      description: '返回结果数量上限，默认 20',
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
            startDate: { type: 'string', description: '开始日期 YYYY-MM-DD，未指定则默认本月1日' },
            endDate: { type: 'string', description: '结束日期 YYYY-MM-DD，未指定则默认今天' },
            status: {
              type: 'string',
              enum: ['active', 'cancelled', 'completed'],
              description: '事件状态筛选',
            },
            limit: { type: 'number', description: '返回数量上限' },
          },
        },
      },
    };
  }

  async execute(
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    try {
      // 日期未指定时默认本月1日 ~ 今天
      const now = new Date();
      const startDate = (args.startDate as string) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const endDate = (args.endDate as string) ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const events = await this.eventsService.getEventsForRange(
        startDate,
        endDate,
        Number(userId),
      );

      const status = args.status as string | undefined;
      const limit = (args.limit as number) ?? 20;

      let filtered = events;
      if (status === 'cancelled') {
        filtered = events.filter((e: any) => e.isCancelled === true);
      } else if (status === 'active') {
        filtered = events.filter((e: any) => e.isCancelled === false);
      } else if (status === 'completed') {
        // 假设没有结束时间或者用 isCancelled 表示完成状态
        filtered = events.filter((e: any) => e.isCancelled === false);
      }

      return {
        success: true,
        data: filtered.slice(0, limit).map((e: any) => ({
          id: e.id,
          title: e.title,
          startTime: e.startTime,
          endTime: e.endTime,
          location: e.location,
          isCancelled: e.isCancelled,
          colorRole: e.colorRole,
        })),
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  }
}
