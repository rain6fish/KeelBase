// SPDX-License-Identifier: Apache-2.0

/**
 * `tool_call` 审计行的组装（阶段 3 第十二刀：从 `AiService` 的**四处**内联字面量提出）。
 *
 * 提出理由不是行数，是**字段集曾经漂移过**：四处字面量里躺着「对齐非流式 runToolLoop」
 * 「T5 跨入口一致：流式 deny 也标 source=bridge（对齐非流式 deny 与两路成功分支）」这类注释——
 * 它们是**手工把漂移对回来**留下的疤。审计行的字段集是对外契约（管理台时间线、A-8 denied 视图、
 * blocked 聚合都按列读），任何一处漏列都会让同一动作在不同入口呈现不同事实。
 *
 * 组装规则（与提出前逐字一致）：
 * - `detail` 用**原文参数串**（调用方手上就是它解析出来的那串，不重新序列化）
 * - `isError`：未执行（deny / 待批）恒为真；有结果时按结果判，且 **R4 待批不算失败**
 *   （否则单次审批被计 approved + blocked + errors 三重误报）
 * - `businessEvent` / `evidence`：**只有真正执行过（有结果）才派生**——deny 行不含这两列
 * - `authorization`：放行快照（成功且实际放行）或 deny reasons 的 JSON，由调用方判断该给哪个
 * - `source`：B 路径代理写标 bridge（四处一致）
 */
import type { AuditEntry } from './audit.service';
import { deriveAiBusinessEvent } from './ai-business-event';
import { captureDecisionEvidence } from './decision-evidence';
import { ToolResult } from '../interfaces/tool.interface';

export interface ToolCallAuditInput {
  userId: string;
  conversationId: string;
  provider: string;
  toolName: string;
  /** 原样进 detail 的参数串 */
  argsJson: string;
  /** B 路径代理写（ProxyTool 向外部系统）→ `source: 'bridge'` */
  bridge: boolean;
  /** 执行结果；未执行路径（deny / 待批）为 undefined */
  result?: ToolResult;
  /** 失败文案；未执行路径必填，执行路径缺省时取 `result.error` */
  errorMessage?: string;
  /** 授权依据：放行快照（`buildAllowSnapshot`）或 deny reasons 的 JSON */
  authorization?: string;
  /** R4 待批：已提交人工审批不算失败（此区分当前只有流式路径有） */
  pendingApproval?: boolean;
}

export function buildToolCallAudit(input: ToolCallAuditInput): AuditEntry {
  const { result } = input;
  return {
    userId: input.userId,
    conversationId: input.conversationId,
    action: 'tool_call',
    detail: `${input.toolName}(${input.argsJson})`,
    isError: result ? !result.success && !input.pendingApproval : true,
    errorMessage: input.errorMessage ?? result?.error,
    // 工具内部自调 LLM 时（如 summarize_customer_360）的开销记在工具自己这行
    promptTokens: result?.usage?.promptTokens,
    completionTokens: result?.usage?.completionTokens,
    businessEvent: result ? deriveAiBusinessEvent(input.toolName) ?? undefined : undefined,
    evidence: result ? captureDecisionEvidence(input.toolName, result) ?? undefined : undefined,
    source: input.bridge ? 'bridge' : undefined,
    provider: input.provider,
    authorization: input.authorization,
  };
}
