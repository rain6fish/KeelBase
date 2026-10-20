// SPDX-License-Identifier: Apache-2.0

/**
 * 创建请假申请工具 — create_leave_request（写操作，需人工确认）
 *
 * EASY-2 自动生成：requiresConfirmation + requireVerifiedEmail（HS-2/HS-6）；
 * 幂等与撤销由 AiToolEffectsService 处理（resultType: leave_request）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface LeaveRequestsServiceLike {
  create(dto: any, userId: number): Promise<any>;
}

export class CreateLeaveRequestTool implements AiTool {
  readonly name = 'create_leave_request';
  readonly riskLevel = 'R3';
  readonly requiresConfirmation = true;
  readonly permissions = { requireVerifiedEmail: true };
  readonly description = '创建请假申请（申请单号、请假类型、开始日期、结束日期、请假天数、请假事由、审批状态）。这是写操作，系统会弹出确认框，用户确认后才真正创建。';
  readonly parameters: ToolParameter[] = [
    { name: 'requestNo', type: 'string', description: '申请单号', required: true },
    { name: 'leaveType', type: 'string', description: '请假类型', required: true,
      enum: ['annual', 'sick', 'personal', 'other'] },
    { name: 'startDate', type: 'string', description: '开始日期', required: true },
    { name: 'endDate', type: 'string', description: '结束日期', required: true },
    { name: 'days', type: 'number', description: '请假天数', required: true },
    { name: 'reason', type: 'string', description: '请假事由', required: false },
    { name: 'status', type: 'string', description: '审批状态', required: false,
      enum: ['pending', 'approved', 'rejected'] },
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
            requestNo: { type: 'string', description: '申请单号' },
            leaveType: { type: 'string', description: '请假类型', enum: ['annual', 'sick', 'personal', 'other'] },
            startDate: { type: 'string', description: '开始日期' },
            endDate: { type: 'string', description: '结束日期' },
            days: { type: 'number', description: '请假天数' },
            reason: { type: 'string', description: '请假事由' },
            status: { type: 'string', description: '审批状态', enum: ['pending', 'approved', 'rejected'] },
          },
          required: ['requestNo', 'leaveType', 'startDate', 'endDate', 'days'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const dto: Record<string, unknown> = {};
        if (args.requestNo !== undefined) dto.requestNo = args.requestNo as any;
        if (args.leaveType !== undefined) dto.leaveType = args.leaveType as any;
        if (args.startDate !== undefined) dto.startDate = args.startDate as any;
        if (args.endDate !== undefined) dto.endDate = args.endDate as any;
        if (args.days !== undefined) dto.days = args.days as any;
        if (args.reason !== undefined) dto.reason = args.reason as any;
        if (args.status !== undefined) dto.status = args.status as any;
      const entity = await this.leave_requestsService.create(dto, Number(userId));
      return { success: true, data: { id: entity.id, requestNo: entity.requestNo } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
