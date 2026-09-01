// SPDX-License-Identifier: Apache-2.0

/**
 * 查询项目工具 — query_projects（只读）
 *
 * 按 userId 限定数据范围；支持状态/关键词筛选。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface PmServiceLike {
  listProjects(userId: number, filter: { status?: string; keyword?: string }): Promise<{ items: any[]; total: number }>;
}

export class QueryProjectsTool implements AiTool {
  readonly name = 'query_projects';
  readonly description =
    '查询项目列表（可按状态/关键词筛选）。用户问"有哪些项目/进行中的项目/延期风险项目"时使用。返回项目 id、名称、状态、风险等级、截止日期。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'status',
      type: 'string',
      description: '项目状态：planned（规划中）/ active（进行中）/ on_hold（暂停）/ completed（已完成）（可选）',
      required: false,
      enum: ['planned', 'active', 'on_hold', 'completed'],
    },
    {
      name: 'keyword',
      type: 'string',
      description: '按名称/描述关键词搜索（可选）',
      required: false,
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
            status: { type: 'string', enum: ['planned', 'active', 'on_hold', 'completed'], description: '项目状态' },
            keyword: { type: 'string', description: '关键词' },
          },
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const result = await this.pmService.listProjects(Number(userId), {
        status: args.status as string | undefined,
        keyword: args.keyword as string | undefined,
      });
      const items = result.items.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        riskLevel: p.riskLevel,
        endDate: p.endDate ?? null,
      }));
      return { success: true, data: { total: result.total, items } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
