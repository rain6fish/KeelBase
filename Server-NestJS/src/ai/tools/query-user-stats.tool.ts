/**
 * 用户统计工具 — get_user_stats
 *
 * 查询当前用户的基本信息和事件统计数据。
 */

import { AiTool, ToolDefinition, ToolResult } from '../interfaces/tool.interface';
import { ToolParameter } from '../interfaces/tool.interface';

interface UsersServiceLike {
  findOne(id: number): Promise<Partial<{ id: number; username: string; nickname: string; createdAt: Date }>>;
}

interface EventsServiceLike {
  getEventsForRange(start: string, end: string, userId?: number): Promise<any[]>;
}

export class QueryUserStatsTool implements AiTool {
  readonly name = 'get_user_stats';
  readonly description = '查询当前用户的基本信息和事件统计数据（总事件数、活跃事件数等）。用于数据概览和个人信息展示。';
  readonly parameters: ToolParameter[] = [];

  constructor(
    private readonly usersService: UsersServiceLike,
    private readonly eventsService: EventsServiceLike,
  ) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    };
  }

  async execute(
    _args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    try {
      const uid = Number(userId);
      const [user, events] = await Promise.all([
        this.usersService.findOne(uid),
        this.eventsService.getEventsForRange('2000-01-01', '2099-12-31', uid),
      ]);

      const total = events.length;
      const cancelled = events.filter((e: any) => e.isCancelled === true).length;
      const active = total - cancelled;

      return {
        success: true,
        data: {
          username: user.username,
          nickname: user.nickname,
          memberSince: user.createdAt instanceof Date
            ? user.createdAt.toISOString()
            : String(user.createdAt),
          totalEvents: total,
          activeEvents: active,
          cancelledEvents: cancelled,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  }
}
