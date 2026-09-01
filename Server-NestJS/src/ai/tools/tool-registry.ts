// SPDX-License-Identifier: Apache-2.0

/**
 * 工具注册表
 *
 * 管理所有 AiTool 的注册、查找和执行。
 * 工具执行时自动校验必填参数。
 */

import {
  AiTool,
  ToolDefinition,
  ToolResult,
  ToolRiskLevel,
  resolveRiskLevel,
} from '../interfaces/tool.interface';

export class ToolRegistry {
  private readonly tools = new Map<string, AiTool>();

  /**
   * 注册一个工具
   */
  register(tool: AiTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 工具是否为写操作（需人工确认）。
   * W5 风险模型：R3（业务敏感写）/ R4（高影响动作）需确认；R0-R2 自动；R5 阻断。
   */
  requiresConfirmation(name: string): boolean {
    return ['R3', 'R4'].includes(this.riskLevel(name));
  }

  /**
   * 工具风险等级（R0-R5）：显式声明优先，否则按 requiresConfirmation 派生（R3/R1）。
   */
  riskLevel(name: string): ToolRiskLevel {
    return resolveRiskLevel(this.getTool(name));
  }

  /**
   * 按名称获取工具
   */
  getTool(name: string): AiTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found`);
    }
    return tool;
  }

  /**
   * 获取所有已注册工具的 ToolDefinition（传给 LLM 使用）
   */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) =>
      tool.toToolDefinition(),
    );
  }

  /**
   * 执行指定工具
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    userId: string,
  ): Promise<ToolResult> {
    const tool = this.getTool(name);

    // 校验必填参数
    for (const param of tool.parameters) {
      if (param.required && !(param.name in args)) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }
    }

    return tool.execute(args, userId);
  }

  /**
   * 获取所有已注册的工具
   */
  getAllTools(): AiTool[] {
    return Array.from(this.tools.values());
  }
}
