// SPDX-License-Identifier: Apache-2.0

/**
 * ORG-5 组织审批待办统计工具 — query_org_tasks
 *
 * 组织边界授权：按组织成员聚合审批任务（pending / 已处理）。
 * 数据限定在请求用户所属组织内（getOrgApprovalTaskStats 以 org 域过滤）。
 */

import { AiTool, ToolDefinition, ToolResult } from '../interfaces/tool.interface';
import { ToolParameter } from '../interfaces/tool.interface';

interface OrgServiceLike {
  getUserOrgId(userId: number): Promise<number | null>;
  getOrgApprovalTaskStats(userId: number): Promise<{
    orgId: number;
    members: Array<{ nickname: string | null; deptName: string | null; pending: number; processed: number; total: number }>;
  }>;
}

export class QueryOrgTasksTool implements AiTool {
  readonly name = 'query_org_tasks';
  readonly description =
    '查询组织审批待办统计（按成员聚合 pending/已处理任务数）。组织边界授权：仅返回请求用户所属组织的数据。';
  readonly parameters: ToolParameter[] = [];

  constructor(private readonly orgService: OrgServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: { type: 'object', properties: {} },
      },
    };
  }

  async execute(_args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const orgId = await this.orgService.getUserOrgId(Number(userId));
      if (orgId == null) {
        return { success: false, error: '您不是任何组织的成员' };
      }
      const stats = await this.orgService.getOrgApprovalTaskStats(Number(userId));
      return { success: true, data: stats };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
