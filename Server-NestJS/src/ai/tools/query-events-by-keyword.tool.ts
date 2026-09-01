// SPDX-License-Identifier: Apache-2.0

/**
 * 事件搜索工具 — query_events_by_keyword
 *
 * 按关键词搜索事件，支持日期范围和分页。
 */

import { AiTool, ToolDefinition, ToolResult } from '../interfaces/tool.interface';
import { ToolParameter } from '../interfaces/tool.interface';

interface EventsServiceLike {
  search(
    params: { keyword?: string; start?: string; end?: string; page: number; limit: number },
    userId?: number,
  ): Promise<{ items: any[]; total: number }>;
}

export class QueryEventsByKeywordTool implements AiTool {
  readonly name = 'query_events_by_keyword';
  readonly description = '按关键词搜索事件标题和描述，支持日期范围筛选。用于快速查找特定内容的事件。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'keyword',
      type: 'string',
      description: '搜索关键词',
      required: true,
    },
    {
      name: 'startDate',
      type: 'string',
      description: '开始日期，格式 YYYY-MM-DD（可选）',
      required: false,
    },
    {
      name: 'endDate',
      type: 'string',
      description: '结束日期，格式 YYYY-MM-DD（可选）',
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
            keyword: { type: 'string', description: '搜索关键词' },
            startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
            endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
          },
          required: ['keyword'],
        },
      },
    };
  }

  async execute(
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    try {
      const result = await this.eventsService.search(
        {
          keyword: args.keyword as string,
          start: args.startDate as string | undefined,
          end: args.endDate as string | undefined,
          page: 1,
          limit: 20,
        },
        Number(userId),
      );

      return {
        success: true,
        data: result.items,
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  }
}
