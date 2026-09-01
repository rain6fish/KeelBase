// SPDX-License-Identifier: Apache-2.0

/**
 * 删除客户工具 — delete_customer（R5 阻断演示载体）
 *
 * 风险级 R5（不可逆 / 外部动作）：删除客户会级联删除订单、跟进任务、联系人、销售机会，
 * 属于不可逆的高风险操作，被系统策略在工具执行前强制阻断（_assertToolAllowed），
 * 永不进入确认或执行。本工具用于让「高风险动作被阻断」这条治理链路可被外部真实演示与验证。
 *
 * execute 不会被调用（R5 阻断先于执行）；此处返回阻断语义作为防御。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

export class DeleteCustomerTool implements AiTool {
  readonly name = 'delete_customer';
  readonly requiresConfirmation = false; // R5 阻断，不进入确认
  readonly riskLevel = 'R5';
  readonly description =
    '不可逆删除客户（级联删除该客户的订单/跟进任务/联系人/销售机会）。' +
    '这是不可逆的高风险操作，风险级 R5，会被系统策略阻断，永不执行。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'customerId',
      type: 'number',
      description: '要删除的客户 id（来自 query_customers 返回）',
      required: true,
    },
    {
      name: 'reason',
      type: 'string',
      description: '删除原因（展示用）',
      required: false,
    },
  ];

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            customerId: { type: 'number', description: '要删除的客户 id' },
            reason: { type: 'string', description: '删除原因' },
          },
          required: ['customerId'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, _userId: string): Promise<ToolResult> {
    void args;
    // R5 阻断先于执行（_assertToolAllowed），此处为防御性返回
    return { success: false, error: 'delete_customer is blocked (risk level R5)' };
  }
}
