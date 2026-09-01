// SPDX-License-Identifier: Apache-2.0

/**
 * 项目风险分析工具 — analyze_project_risk（只读）
 *
 * 综合逾期任务/延期里程碑/未解决风险/项目状态，输出风险等级 + 理由。
 * AI Project 旗舰演示「判断项目延期风险并创建任务」的核心分析步骤。
 */

import { AiTool, ToolDefinition, ToolParameter, ToolResult } from '../interfaces/tool.interface';

interface PmServiceLike {
  analyzeProjectRisk(projectId: number, userId: number): Promise<{
    level: string;
    score: number;
    reasons: string[];
    dataPoints: Record<string, unknown>;
  }>;
}

export class AnalyzeProjectRiskTool implements AiTool {
  readonly name = 'analyze_project_risk';
  readonly description =
    '分析项目延期风险（low/medium/high/critical）：综合逾期任务、延期里程碑、未解决风险与项目状态。用户问"哪个项目有延期风险/进度如何/该重点关注谁"时，先 query_projects 拿项目列表，再对候选项目逐个调用本工具。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'projectId',
      type: 'number',
      description: '项目 id（来自 query_projects 返回）',
      required: true,
    },
  ];

  constructor(private readonly pmService: PmServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: { projectId: { type: 'number', description: '项目 id' } },
          required: ['projectId'],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const projectId = Number(args.projectId);
      if (!Number.isFinite(projectId)) {
        return { success: false, error: 'projectId 必须是数字' };
      }
      const result = await this.pmService.analyzeProjectRisk(projectId, Number(userId));
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
