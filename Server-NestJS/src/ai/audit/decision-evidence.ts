// SPDX-License-Identifier: Apache-2.0

/**
 * §internal.16 A-1 Decision Evidence（链外）：analyze_* 确定性打分 → 决策证据 JSON。
 *
 * 与 `ai-business-event.ts` 同类：把一次工具调用的结果归一成审计行上的一个字段，
 * 纯函数、不依赖任何服务——故直接成模块，而不是挂在某个 service 上（阶段 3 第六刀）。
 */

import { ToolResult } from '../interfaces/tool.interface';

/** analyze_* 确定性打分 → {decision, evidence[], policy, confidence} JSON（链外）。 */
export function captureDecisionEvidence(toolName: string, result: ToolResult): string | null {
  if (toolName !== 'analyze_customer_risk' && toolName !== 'analyze_project_risk') return null;
  const data = result.data as { level?: string; score?: number; reasons?: string[] } | undefined;
  if (!data || typeof data.score !== 'number' || typeof data.level !== 'string') return null;
  return JSON.stringify({
    decision: data.level,
    evidence: Array.isArray(data.reasons) ? data.reasons.slice(0, 20) : [],
    policy: '风险评分阈值：score≥10 critical / ≥6 high / ≥3 medium',
    confidence: Math.min(data.score / 12, 1),
  });
}
