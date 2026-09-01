// SPDX-License-Identifier: Apache-2.0

/**
 * 提交审批请求工具 — submit_approval_request（写操作）
 *
 * 需人工确认（requiresConfirmation = true）+ 已验证邮箱。
 * 创建 pending 审批请求；幂等与撤销由 AiToolEffectsService 处理（resultType: app_request，软删）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface ApprovalServiceLike {
  createRequest(dto: { title: string; type?: string; amount: number; reason: string }, userId: number): Promise<{ id: number; title: string; status: string }>;
}

export class SubmitApprovalRequestTool implements AiTool {
  readonly name = 'submit_approval_request';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description =
    '提交审批请求（报销/采购/请假/合同）。用户明确要求"提交/发起/创建报销、采购申请、请假审批"时使用（如"帮我提交一笔采购申请"）。' +
    '这是写操作，调用后系统会弹出确认框，用户确认后才真正创建。' +
    '用户已给出类型/金额等关键信息时应直接调用本工具触发确认流程，不要推迟或先追问；缺失的次要信息由确认流程或后续对话补齐。' +
    '创建后可用 review_approval_request 让 AI 预审。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'title',
      type: 'string',
      description: '标题，如"Q3 差旅报销"',
      required: true,
    },
    {
      name: 'type',
      type: 'string',
      description: '类型：reimbursement（报销）/ purchase（采购）/ leave（请假）/ contract（合同）（可选）',
      required: false,
      enum: ['reimbursement', 'purchase', 'leave', 'contract'],
    },
    {
      name: 'amount',
      type: 'number',
      description: '金额（元）',
      required: true,
    },
    {
      name: 'reason',
      type: 'string',
      description: '事由说明',
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
          properties: {
            title: { type: 'string', description: '标题' },
            type: { type: 'string', enum: ['reimbursement', 'purchase', 'leave', 'contract'], description: '类型' },
            amount: { type: 'number', description: '金额' },
            reason: { type: 'string', description: '事由' },
          },
          required: ['title', 'amount', 'reason'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const amount = Number(args.amount);
      if (!Number.isFinite(amount)) {
        return { success: false, error: 'amount 必须是数字' };
      }
      const dto: { title: string; type?: string; amount: number; reason: string } = {
        title: String(args.title ?? ''),
        amount,
        reason: String(args.reason ?? ''),
        ...(args.type !== undefined ? { type: String(args.type) } : {}),
      };
      const req = await this.approvalService.createRequest(dto, Number(userId));
      return { success: true, data: { id: req.id, title: req.title, status: req.status } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
