// SPDX-License-Identifier: Apache-2.0

/**
 * 事件状态统计工具 — count_events_by_status
 *
 * 统计指定日期范围内的事件数量，按完成状态分组。
 */

import { AiTool, ToolDefinition, ToolResult } from '../interfaces/tool.interface';
import { ToolParameter } from '../interfaces/tool.interface';

interface EventsServiceLike {
  getEventsForRange(start: string, end: string, userId?: number): Promise<any[]>;
}

export class CountEventsByStatusTool implements AiTool {
  readonly name = 'count_events_by_status';
  readonly description = '按状态统计指定日期范围内的事件数量，返回总数、活跃数和已取消数。用于快速了解事件分布情况。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'startDate',
      type: 'string',
      description: '开始日期，格式 YYYY-MM-DD，不传则统计全部',
      required: false,
    },
    {
      name: 'endDate',
      type: 'string',
      description: '结束日期，格式 YYYY-MM-DD，不传则统计全部',
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
            startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
            endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
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
      const events = await this.eventsService.getEventsForRange(
        (args.startDate as string) ?? '2000-01-01',
        (args.endDate as string) ?? '2099-12-31',
        Number(userId),
      );

      const total = events.length;
      const cancelled = events.filter((e: any) => e.isCancelled === true).length;
      const active = total - cancelled;

      return {
        success: true,
        data: { total, active, cancelled },
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  }
}
