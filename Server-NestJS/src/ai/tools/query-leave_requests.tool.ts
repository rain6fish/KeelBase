// SPDX-License-Identifier: Apache-2.0

/**
 * 查询请假申请工具 — query_leave_requests（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface LeaveRequestsServiceLike {
  findAll(userId: number, q?: string): Promise<any[]>;
}

export class QueryLeaveRequestsTool implements AiTool {
  readonly name = 'query_leave_requests';
  readonly description = '查询请假申请列表（本人数据）。用户问"有哪些请假申请"时使用。';
  readonly parameters: ToolParameter[] = [
    { name: 'keyword', type: 'string', description: '关键字（可选）', required: false },
  ];

  constructor(private readonly leave_requestsService: LeaveRequestsServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '关键字（可选）' },
          },
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const keyword = typeof args.keyword === 'string' ? args.keyword : undefined;
      const items = await this.leave_requestsService.findAll(Number(userId), keyword);
      const data = items.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        o.requestNo = item.requestNo;
        o.leaveType = item.leaveType;
        o.startDate = item.startDate;
        o.endDate = item.endDate;
        o.days = item.days;
        o.reason = item.reason;
        o.status = item.status;
        return o;
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
