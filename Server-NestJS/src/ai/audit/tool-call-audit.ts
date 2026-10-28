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
 * - `authorization`：放行快照（成功执行 / 被扣下等人 / 没发生的那两种）或 deny reasons 的 JSON，由调用方判断该给哪个
 * - `source`：B 路径代理写标 bridge（四处一致）
 */
import type { AuditEntry } from '../../governance-shared/services/audit.service';
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
  /**
   * How a confirmation ended **without an execution** — a person declined it, or the window closed
   * with no decision. Callers pass the decision; the word is decided here, once.
   *
   * ⚠ **`timeout` has no word of its own** in the frozen vocabulary
   * (`ai-audit-log-outcome-v1-vector.json`, `legalByAction.tool_call`): it settles on `failed`, the
   * value that vector assigns to a timeout. Inventing `not_executed` was tried on 2026-10-28 and
   * reverted — it would write rows a conforming consumer must reject. Giving "nothing ran" its own
   * word is a contract change, not a code change.
   *
   * 确认以「**没有执行**」收场的两种情形：有人拒绝，或窗口到期无人裁决。调用方给的是裁决，词由这里一处定。
   *
   * ⚠ **`timeout` 在冻结词表里没有自己的词**（`legalByAction.tool_call`）：它落到 `failed` ——
   * 那个向量把「超时」归给的值。2026-10-28 试过造一个 `not_executed`，已撤回 —— 那会写出符合契约的
   * 消费方**必须拒绝**的行。给「没发生」一个自己的词是**契约变更**，不是代码变更。
   */
  unconfirmed?: 'declined' | 'timeout';
  /**
   * §22.19 AU-2: the handle that groups every row of one delegate/plan turn — written on the turn's
   * `tool_call` rows and on its conversation-level row alike, so the whole turn is one query away.
   * The column is *named* for a parent pointer but is used here as a grouping key; no consumer
   * dereferences it (verified 2026-10-01), so nothing resolves it to another row.
   *
   * §22.19 AU-2：把一次 delegate / plan 轮次的所有行归到一组的句柄——既写在该轮的工具行上，也写在
   * 其对话级行上，整轮因此一次查询可取回。该列**名为**父指针，此处用作分组键；已核实无消费方解引用
   * 它（2026-10-01），故无人把它解析成另一行。
   */
  parentActionId?: string;
  /**
   * The structured deny reasons when this call was refused (`AuthorizationDeniedError.reasons`).
   * Needed to tell the two gates apart: a refusal whose reasons name `risk_policy` never reached a
   * decision and is `blocked`, while every other refusal is `refused`. The prose in `errorMessage` is
   * not enough — reading that sentence is exactly the parsing this column exists to remove.
   *
   * 被拒时带上**结构化**的 deny reasons（`AuthorizationDeniedError.reasons`）—— 用来分辨**两道不同的闸**：
   * reasons 里点名 `risk_policy` 的拒绝**从没到过裁决**，是 `blocked`；其余拒绝是 `refused`。光有
   * `errorMessage` 里那句话是不够的 —— 读那句话，正是本列存在的意义所要消掉的那件事。
   */
  deniedBy?: string[];
}

/**
 * A confirmation's decision, as the C-3 vocabulary spells it (contract: `ai-audit-log-row` v5). One
 * place decides what each decision is called, so the two inline confirmation rows cannot drift apart
 * — the same reason this file was extracted in the first place.
 *
 * 一次确认的裁决，用 C-3 的词表来说（契约：`ai-audit-log-row` v5）。**由一处决定每个裁决叫什么**，
 * 两处内联的确认行才不会各自漂移 —— 与这个文件当初被提出来的理由是同一条。
 */
export function confirmationOutcome(decision: 'approve' | 'decline' | 'timeout'): string {
  return decision === 'approve' ? 'approved' : decision === 'decline' ? 'declined' : 'timeout';
}

/**
 * The `tool_call` spelling of "it ran": the half of the vocabulary that has no deny branch and no
 * waiting branch. Exported because the R4 executor writes its own row (it is not the chat path) and
 * must answer with the same word — a second copy of this mapping is how the two ends would drift.
 *
 * `tool_call` 行对「它跑过了」的说法：词表里既没有拒绝分支、也没有等待分支的那一半。之所以导出，
 * 是因为 R4 执行器**自己拼它的行**（它不是对话那条路），却必须用同一个词 —— 这份映射抄第二遍，
 * 正是两端会漂移的来路。
 */
export function toolCallOutcome(result: { success: boolean }): string {
  return result.success ? 'executed' : 'failed';
}

export function buildToolCallAudit(input: ToolCallAuditInput): AuditEntry {
  const { result } = input;
  // Order matters: the R4 path hands over both a `result` (a placeholder failure saying "submitted for
  // human approval") *and* `pendingApproval`, and awaiting a person is `pending` — never `failed`.
  //
  // 顺序不能颠倒：R4 那条路**同时**给了一个 `result`（一句「已提交人工审批」的占位失败）**和**
  // `pendingApproval`，而「在等人」是 `pending`，绝不是 `failed`。
  const outcome = input.pendingApproval
    ? 'pending'
    : input.unconfirmed
      ? // `declined` names who ended it. A timeout has no word of its own in the frozen vocabulary —
        // see the `unconfirmed` field's comment; it settles on `failed`.
        // `declined` 点名是谁结束的。超时在冻结词表里没有自己的词（见 `unconfirmed` 字段的注释），
        // 落到 `failed`。
        input.unconfirmed === 'declined'
        ? 'declined'
        : 'failed'
      : result
        ? toolCallOutcome(result)
        : input.deniedBy?.includes('risk_policy')
          ? 'blocked'
          : 'refused';
  return {
    userId: input.userId,
    conversationId: input.conversationId,
    action: 'tool_call',
    detail: `${input.toolName}(${input.argsJson})`,
    outcome,
    tool: input.toolName,
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
    parentActionId: input.parentActionId,
  };
}
