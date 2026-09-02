// SPDX-License-Identifier: Apache-2.0

/**
 * 长期未跟进客户检测工具 — detect_idle_customers（只读 R1）
 *
 * AI Follow-up Agent（A1）：检测请求用户名下长期未跟进（默认 30 天无任何跟进活动，
 * 含从未联系）的客户。最近联系时间从 crm_activities.happenedAt 派生，无迁移。
 * 数据为确定性聚合，AI 只做理解→汇总→建议跟进（建任务走 create_followup_task，需确认）。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface CrmServiceLike {
  detectIdleCustomers(
    userId: number,
    minIdleDays?: number,
    limit?: number,
  ): Promise<{
    thresholdDays: number;
    count: number;
    items: Array<{
      customerId: number;
      customerName: string;
      company: string | null;
      status: string;
      riskLevel: string;
      lastContactAt: string | null;
      idleDays: number | null;
      neverContacted: boolean;
    }>;
  }>;
}

export class DetectIdleCustomersTool implements AiTool {
  readonly name = 'detect_idle_customers';
  readonly description =
    '检测长期未跟进（默认 30 天无任何跟进活动，含从未联系）的客户，返回客户 + 最近联系时间 + 未联系天数。' +
    '用户问"哪些客户很久没跟进了 / 该跟进谁 / 有哪些客户被冷落了 / 哪些客户需要回访"时使用。' +
    '检测后可为候选客户建议跟进任务（创建任务请让用户确认，用 create_followup_task）。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'minIdleDays',
      type: 'number',
      description: '未跟进阈值天数（默认 30：最近 30 天无任何跟进活动即命中）',
      required: false,
    },
    {
      name: 'limit',
      type: 'number',
      description: '返回条数上限（默认 20，最多 50）',
      required: false,
    },
  ];

  constructor(private readonly crmService: CrmServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            minIdleDays: { type: 'number', description: '未跟进阈值天数（默认 30）' },
            limit: { type: 'number', description: '返回条数上限（默认 20，最多 50）' },
          },
          required: [],
        },
      },
    };
  }

  async execute(
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    try {
      const minIdleDays = args.minIdleDays !== undefined ? Number(args.minIdleDays) : 30;
      if (!Number.isFinite(minIdleDays) || minIdleDays < 1) {
        return { success: false, error: 'minIdleDays 必须是 ≥1 的数字' };
      }
      const limit = args.limit !== undefined ? Number(args.limit) : 20;
      const result = await this.crmService.detectIdleCustomers(Number(userId), minIdleDays, Number.isFinite(limit) ? limit : 20);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
