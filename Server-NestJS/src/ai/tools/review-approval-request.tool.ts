/**
 * AI 预审批复工具 — review_approval_request（写操作）
 *
 * 需人工确认（requiresConfirmation = true）+ 已验证邮箱。
 * 按审批政策分级：金额 ≤ 阈值 → 低风险自动通过（auto_approved）；否则转人工复核（needs_review）。
 * 状态变更型写操作，不创建可撤销记录（不记副作用）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface ApprovalServiceLike {
  reviewRequest(id: number, userId: number): Promise<{ id: number; status: string; riskLevel: string; aiRecommendation?: string | null }>;
}

export class ReviewApprovalRequestTool implements AiTool {
  readonly name = 'review_approval_request';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description =
    'AI 预审审批请求：读取请求并按审批政策分级——金额不超过阈值则自动通过（低风险），超出阈值转人工复核（需人工决定）。' +
    '用户要求"帮我审批/预审/看下这个报销能不能过"时，先 query_approval_policies 拿政策、query_approval_requests 拿请求，再调用本工具。' +
    '这是写操作，系统会弹出确认框，用户确认后 AI 才执行预审。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'requestId',
      type: 'number',
      description: '审批请求 id（来自 query_approval_requests 返回）',
      required: true,
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
          properties: { requestId: { type: 'number', description: '审批请求 id' } },
          required: ['requestId'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const requestId = Number(args.requestId);
      if (!Number.isFinite(requestId)) {
        return { success: false, error: 'requestId 必须是数字' };
      }
      const req = await this.approvalService.reviewRequest(requestId, Number(userId));
      return {
        success: true,
        data: { id: req.id, status: req.status, riskLevel: req.riskLevel, aiRecommendation: req.aiRecommendation ?? null },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
