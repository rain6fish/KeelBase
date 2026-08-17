/**
 * 查询审批政策工具 — query_approval_policies（只读）
 *
 * 返回审批政策（类型 + 自动通过金额阈值），供 AI 预审判断使用。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface ApprovalServiceLike {
  listPolicies(userId: number): Promise<any[]>;
}

export class QueryApprovalPoliciesTool implements AiTool {
  readonly name = 'query_approval_policies';
  readonly description =
    '查询审批政策列表（类型 + 自动通过金额阈值）。AI 预审批复请求前调用本工具获取政策，判断金额是否在自动通过范围内。';
  readonly parameters: ToolParameter[] = [];

  constructor(private readonly approvalService: ApprovalServiceLike) {}

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
      const policies = await this.approvalService.listPolicies(Number(userId));
      return {
        success: true,
        data: policies.map((p) => ({
          id: p.id,
          title: p.title,
          type: p.type,
          maxAmount: p.maxAmount,
          active: p.active,
        })),
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
