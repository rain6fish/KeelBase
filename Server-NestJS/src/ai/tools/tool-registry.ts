// SPDX-License-Identifier: Apache-2.0

/**
 * 工具注册表
 *
 * 管理所有 AiTool 的注册、查找和执行。
 * 工具执行时自动校验必填参数。
 */

import { Injectable } from '@nestjs/common';
import {
  AiTool,
  ToolAbortability,
  ToolDefinition,
  ToolResult,
  ToolRiskLevel,
  isSemanticWrite,
  resolveRevokeClass,
  resolveRiskLevel,
} from '../interfaces/tool.interface';
import { resolveAbortability } from './tool-abortability';

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, AiTool>();

  /**
   * 注册一个工具
   */
  register(tool: AiTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    // KB-6 revokeClass 强制校验：确认写工具若**未显式声明**且被**静默推导**为 none（不可撤）必须显式声明——
    // 否则副作用列表会声称可撤、撤销时却只能失败（做空"revoke≠rollback/外部撤销态"指控的诚实边界）。
    // - 正常确认写（requiresConfirmation）被推导 local_compensate，不触发；
    // - 显式声明 revokeClass（含 none/governed_external）放行——工具作者已诚实声明撤销能力；
    // - 触发的是「riskLevel R3/R4 表达写语义、requiresConfirmation 未设且 revokeClass 未声明」的工具，
    //   其 revokeClass 被静默推导 none，须显式声明。R5（永不执行）/ 读工具 / 干跑允许静默 none。
    const risk = resolveRiskLevel(tool);
    if (
      isSemanticWrite(tool) &&
      tool.revokeClass === undefined &&
      resolveRevokeClass(tool) === 'none'
    ) {
      throw new Error(
        `Tool "${tool.name}" is a write (${risk}) but its revokeClass is silently derived as 'none' ` +
          '(not revocable). Declare revokeClass explicitly (local_compensate if revocable via local ' +
          'soft-delete, governed_external if revoked via a target-system compensation endpoint, none ' +
          'only if truly irrevocable) — a silent `none` would misreport its side effects as revocable.',
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 反注册一个工具（热更新：配置变更后移除旧工具）。返回是否确实存在。
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
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
   * AW-18: how this tool takes a cancellation — `yes` only when the work itself can be stopped.
   * Undeclared non-reads stay `unknown`; a missing tool is `unknown` too, never `yes`.
   *
   * AW-18：这个工具怎么接受取消 —— 只有工作本身停得掉才是 `yes`。未声明的非读工具停在 `unknown`；
   * 查不到的工具同样是 `unknown`，绝不是 `yes`。
   */
  abortability(name: string): ToolAbortability {
    const tool = this.tools.get(name);
    return tool ? resolveAbortability(tool) : 'unknown';
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
   * 获取已注册工具的 ToolDefinition（传给 LLM 使用）。
   * 可选谓词在**定义生成前**过滤 —— 对外暴露面按主体收窄时，未通过的工具连 schema 都不下发。
   * 省略谓词 = 全部（内部调用与既有调用方行为不变）。
   *
   * Get the registered tools' definitions for the LLM. An optional predicate filters **before**
   * definitions are built, so a tool outside the caller's exposure surface is not even described.
   * Omitting it keeps the previous all-tools behaviour for existing callers.
   */
  getToolDefinitions(predicate?: (tool: AiTool) => boolean): ToolDefinition[] {
    const tools = Array.from(this.tools.values());
    return (predicate ? tools.filter(predicate) : tools).map((tool) =>
      tool.toToolDefinition(),
    );
  }

  /**
   * 执行指定工具。AW-14：`signal` 原样转交工具（未声明它的工具照旧忽略）。
   *
   * Run the named tool. AW-14: `signal` is forwarded unchanged; tools that ignore it are unaffected.
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    userId: string,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    const tool = this.getTool(name);

    // 校验必填参数
    for (const param of tool.parameters) {
      if (param.required && !(param.name in args)) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }
    }

    return tool.execute(args, userId, signal);
  }

  /**
   * 获取所有已注册的工具
   */
  getAllTools(): AiTool[] {
    return Array.from(this.tools.values());
  }
}
