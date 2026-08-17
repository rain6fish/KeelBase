/**
 * 查询审批请求工具 — query_approval_requests（只读）
 *
 * 按 requesterId 限定数据范围；支持状态筛选（pending/needs_review/approved/rejected/auto_approved）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface ApprovalServiceLike {
  listRequests(userId: number, filter: { status?: string }): Promise<{ items: any[]; total: number }>;
}

export class QueryApprovalRequestsTool implements AiTool {
  readonly name = 'query_approval_requests';
  readonly description =
    '查询审批请求列表（可按状态筛选）。用户问"有哪些审批/待审批/已通过的申请"时使用。返回请求 id、标题、类型、金额、状态、风险等级、AI 建议。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'status',
      type: 'string',
      description: '状态：pending（待预审）/ needs_review（待人工复核）/ approved（已通过）/ rejected（已驳回）/ auto_approved（自动通过）（可选）',
      required: false,
      enum: ['pending', 'needs_review', 'approved', 'rejected', 'auto_approved'],
    },
  ];

  constructor(private readonly approvalService: ApprovalServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['pending', 'needs_review', 'approved', 'rejected', 'auto_approved'], description: '状态' },
          },
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const result = await this.approvalService.listRequests(Number(userId), {
        status: args.status as string | undefined,
      });
      const items = result.items.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        amount: r.amount,
        status: r.status,
        riskLevel: r.riskLevel,
        aiRecommendation: r.aiRecommendation ?? null,
      }));
      return { success: true, data: { total: result.total, items } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
