// SPDX-License-Identifier: Apache-2.0

/**
 * ORG-5 团队空闲工具 — query_org_availability
 *
 * 组织边界授权：按日期范围统计组织成员的事件数量（忙闲度）。
 * 数据限定在请求用户所属组织内（listMyMembers + getEventsForRange 均为组织域）。
 */

import { AiTool, ToolDefinition, ToolResult } from '../interfaces/tool.interface';
import { ToolParameter } from '../interfaces/tool.interface';

interface OrgServiceLike {
  getUserOrgId(userId: number): Promise<number | null>;
  listMyMembers(userId: number): Promise<Array<Record<string, unknown>>>;
}

interface EventsServiceLike {
  getEventsForRange(start: string, end: string, userId?: number): Promise<any[]>;
}

export class QueryOrgAvailabilityTool implements AiTool {
  readonly name = 'query_org_availability';
  readonly description =
    '查询组织内团队成员在某日期范围的忙闲情况（按事件数统计）。组织边界授权：仅返回请求用户所属组织的数据。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'startDate',
      type: 'string',
      description: '开始日期，格式 YYYY-MM-DD。未指定则默认今天',
      required: false,
    },
    {
      name: 'endDate',
      type: 'string',
      description: '结束日期，格式 YYYY-MM-DD。未指定则默认今天',
      required: false,
    },
  ];

  constructor(
    private readonly orgService: OrgServiceLike,
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
          properties: {
            startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
            endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
          },
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const orgId = await this.orgService.getUserOrgId(Number(userId));
      if (orgId == null) {
        return { success: false, error: '您不是任何组织的成员' };
      }
      const today = this._today();
      const startDate = (args.startDate as string) ?? today;
      const endDate = (args.endDate as string) ?? today;

      const [members, events] = await Promise.all([
        this.orgService.listMyMembers(Number(userId)),
        this.eventsService.getEventsForRange(startDate, endDate, Number(userId)),
      ]);

      const countByUser = new Map<number, number>();
      for (const e of events) {
        const ownerId = Number(e.userId);
        if (!Number.isNaN(ownerId)) {
          countByUser.set(ownerId, (countByUser.get(ownerId) ?? 0) + 1);
        }
      }

      const rows = members.map((m: Record<string, unknown>) => ({
        nickname: m.nickname ?? null,
        deptName: m.deptName ?? null,
        role: m.role ?? 'member',
        eventCount: countByUser.get(Number(m.id)) ?? 0,
      }));

      return {
        success: true,
        data: {
          orgId,
          startDate,
          endDate,
          members: rows,
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  private _today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
