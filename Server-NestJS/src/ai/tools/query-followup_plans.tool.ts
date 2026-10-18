// SPDX-License-Identifier: Apache-2.0

/**
 * 查询跟进计划工具 — query_followup_plans（只读）
 *
 * 按 userId 限定数据范围（本人数据）；EASY-2 自动生成。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface FollowupPlansServiceLike {
  findAll(userId: number): Promise<any[]>;
}

export class QueryFollowupPlansTool implements AiTool {
  readonly name = 'query_followup_plans';
  readonly description = '查询跟进计划列表（本人数据）。用户问"有哪些跟进计划"时使用。';
  // Its list endpoint takes no filter (the hand-extended service reads no `q`), so the tool declares
  // none: a parameter the model could pass and the tool would silently drop is worse than no parameter.
  // 该模块的列表端点没有过滤（手工扩展的 service 不读 `q`），故工具不声明任何参数：一个模型可以传、
  // 而工具会静默丢弃的参数，比没有参数更糟。
  readonly parameters: ToolParameter[] = [];

  constructor(private readonly followup_plansService: FollowupPlansServiceLike) {}

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

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const items = await this.followup_plansService.findAll(Number(userId));
      const data = items.map((item) => {
        const o: Record<string, unknown> = { id: item.id };
        o.title = item.title;
        o.customerId = item.customerId;
        o.priority = item.priority;
        o.reason = item.reason;
        o.dueDate = item.dueDate;
        o.status = item.status;
        return o;
      });
      return { success: true, data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
