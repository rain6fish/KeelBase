// SPDX-License-Identifier: Apache-2.0

/**
 * The words the six-answer export is allowed to use.
 *
 * <p><b>Why a module and not inline strings.</b> The acceptance for U1 is «six columns, **zero
 * internal names**». That is a property of the whole output, so the one place that can break it is
 * the place that turns internal tokens into text. Keeping that in a single module means the rule is
 * testable in one spec and a new module's `result_type` cannot quietly start appearing in a CSV.
 *
 * <p><b>The rule is fail-closed.</b> A token this file does not know maps to a **generic product
 * word** — `Business record`, `AI action` — never to itself. A new business module therefore shows
 * up as «Business record #42» until someone gives it a label here, which is honest but incomplete;
 * echoing `expense_claims` would be neither.
 *
 * 六问导出**只能使用**的词。
 *
 * <p><b>为什么单独一个模块，而不是内联字符串。</b> U1 的验收是「六列、**0 处内部名**」。那是
 * **整份输出**的性质，能破坏它的只有「把内部令牌翻成文字」这一处。把它收进一个模块，规则就只在一份
 * spec 里可测，而新模块的 `result_type` 也不可能悄悄出现在 CSV 里。
 *
 * <p><b>规则是 fail-closed 的。</b> 本文件不认识的令牌一律映射为**通用产品词** —— `Business
 * record`、`AI action` —— 绝不原样回显。于是新业务模块在有人给它配标签之前显示为
 * 「Business record #42」：这不完整，但是**如实**；回显 `expense_claims` 则两者都不是。
 */

import { TOOL_METADATA } from './tool-metadata';
import type { ExplanationState } from './audit-explanation-state';

/**
 * `ai_tool_side_effects.result_type` → the business noun a reader uses. Ordered for the console's
 * object picker; the list is also what a reader may search by.
 *
 * `ai_tool_side_effects.result_type` → 读者口中的业务名词。顺序即控制台对象选择器的顺序；这份
 * 清单同时也是读者可按之检索的清单。
 */
const OBJECT_TYPE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['crm_customer', 'Customer'],
  ['crm_order', 'Order'],
  ['crm_activity', 'Follow-up'],
  ['crm_task', 'Follow-up task'],
  ['crm_risk', 'Risk'],
  ['crm_opportunity', 'Opportunity'],
  ['crm_contact', 'Contact'],
  ['event', 'Event'],
  ['todo', 'Todo'],
  ['pm_project', 'Project'],
  ['pm_task', 'Project task'],
  ['pm_milestone', 'Milestone'],
  ['pm_risk', 'Project risk'],
  ['approval_request', 'Approval request'],
  ['followup_plan', 'Follow-up plan'],
  ['contract', 'Contract'],
  ['supplier', 'Supplier'],
  ['note', 'Note'],
  ['post', 'Post'],
  ['tag', 'Tag'],
  ['book', 'Book'],
  ['report', 'Report'],
  ['proxy_call', 'External system record'],
];

const OBJECT_TYPE_BY_TOKEN = new Map(OBJECT_TYPE_LABELS);

/**
 * A type this table does not name. Saying the token instead is the one thing the export may not do.
 *
 * 本表没有命名的类型。原样说出令牌，正是导出**不能**做的那件事。
 */
const GENERIC_OBJECT = 'Business record';

/** The selectable object types, in picker order. */
export function objectTypeOptions(): Array<{ value: string; label: string }> {
  return OBJECT_TYPE_LABELS.map(([value, label]) => ({ value, label }));
}

/** The business noun for a `result_type`; a generic one when it is unknown. */
export function productObjectLabel(resultType: string | null | undefined): string {
  if (!resultType) return GENERIC_OBJECT;
  return OBJECT_TYPE_BY_TOKEN.get(resultType) ?? GENERIC_OBJECT;
}

/** The Object cell: `<noun> #<business id>`, or the honest "not recorded". */
export function productObjectCell(
  effect: { resultType: string; resultId: number } | null | undefined,
): string {
  if (!effect) return 'Not recorded';
  return `${productObjectLabel(effect.resultType)} #${effect.resultId}`;
}

/**
 * `ai_audit_logs.action` in product words, for rows that name no tool. `tool_call` is not «tool
 * call» to a reader — it is an AI action; a review receipt is not an AI action at all.
 *
 * `ai_audit_logs.action` 的产品词，用于没有具名工具的行。对读者而言 `tool_call` 不是「工具调用」，
 * 而是一次 AI 动作；复核回执则根本**不是** AI 动作。
 */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  chat: 'Chat',
  tool_call: 'AI action',
  tool_confirmation: 'Approval decision',
  navigate: 'Page navigation',
  plan: 'Plan',
  analyze: 'Analysis',
  knowledge: 'Knowledge update',
  delegate: 'Delegation',
  flow_node: 'Workflow step',
  login: 'Sign-in',
  error: 'Error',
  content_blocked: 'Content blocked',
  effect_revoke: 'Undo of an AI write',
  audit_review: 'Audit review receipt',
  claim_release: 'Write-hold release',
};

const GENERIC_ACTION = 'AI action';

/**
 * The Action cell: the tool's business label when there is one, else the action kind. A tool the
 * metadata table does not know falls back to the action kind — never to the tool name.
 *
 * 动作列：有工具就用它的业务标签，否则用动作种类。元数据表不认识的工具退回动作种类 —— **绝不**
 * 退回工具名。
 */
export function productActionLabel(
  tool: string | null | undefined,
  action: string,
): string {
  if (tool) {
    const meta = TOOL_METADATA[tool];
    if (meta) return meta.label;
  }
  return ACTION_LABELS[action] ?? GENERIC_ACTION;
}

/**
 * The Result cell: the same single state the interpretation surface shows, in words. One derivation
 * (`explainState`) feeds both views, so they cannot disagree about the same event.
 *
 * 结果列：与单事件解释面**同一个**状态，只是换成词。两个视图共用 `explainState` 这一处推导，故不会
 * 对同一件事各说各的。
 */
const RESULT_LABELS: Readonly<Record<ExplanationState, string>> = {
  awaiting_confirmation: 'Awaiting confirmation',
  compensation_failed: 'Compensation failed',
  compensation_succeeded: 'Compensation succeeded',
  compensating: 'Compensating',
  executed: 'Executed',
  failed: 'Failed',
  not_executed: 'Not executed',
  rejected: 'Rejected',
  result_unknown: 'Result unknown',
};

export function productResultLabel(state: ExplanationState): string {
  return RESULT_LABELS[state] ?? 'Result unknown';
}

/**
 * What the record shows about approval. `approverName` is the name snapshot carried by the
 * approver's own decision row — the same derivation the single-event read face uses; when it is
 * absent the cell says so rather than guessing.
 *
 * 记录关于批准显示什么。`approverName` 是批准人自己那条裁决行携带的姓名快照 —— 与单事件读面同一条
 * 推导；没有它就如实说没有，不去猜。
 */
export interface AuthorizationFacts {
  confirmation: {
    status: string;
    approverId?: string | null;
    approverName?: string | null;
  } | null;
  /** The operator's display name, when the audit row has one. */
  operatorName?: string | null;
  /** `authorization` parses to a JSON array — the deny-reasons shape. */
  denied: boolean;
  /** `authorization` parses to a JSON object — the allow-snapshot shape. */
  allowed: boolean;
}

/**
 * The Authorization cell.
 *
 * <p>The second-person case names the approver when the evidence carries the name: it is the
 * snapshot on the approver's own decision row in the same conversation, never a lookup in a user
 * table the governance database may not have, and never a guess from tool name plus timestamp.
 * When no name can be resolved — no decision row, or an account that has since been removed — the
 * cell says a **second person** decided and the name was not recorded. It never falls back to
 * «Confirmed by the operator»: the confirmation record still proves someone else decided, and
 * saying otherwise would invert the fact.
 *
 * 授权列。
 *
 * <p>第二人那一格在有姓名时**点名**：姓名取自**同一会话**中批准人自己那条裁决行的快照，既不去
 * join 治理库可能根本没有的用户表，也不按工具名加时间猜。取不到姓名时（没有裁决行，或那个账号
 * 已被删除），那一格说**是第二个人**做的决定、姓名未记录 —— 绝不回退成「本人确认」：确认记录本身
 * 已证明是别人做的决定，反过来写就是把事实说反。
 */
export function productAuthorizationLabel(facts: AuthorizationFacts): string {
  const conf = facts.confirmation;
  if (conf) {
    switch (conf.status) {
      case 'approved':
        return conf.approverId
          ? conf.approverName
            ? `Approved by ${conf.approverName}`
            : 'Second-person approval (approver name not recorded)'
          : `Confirmed by ${facts.operatorName || 'the operator'}`;
      case 'declined':
        return conf.approverId
          ? conf.approverName
            ? `Declined by ${conf.approverName}`
            : 'Declined by a second person'
          : 'Declined by the operator';
      case 'pending':
        return 'Awaiting a decision';
      case 'timeout':
        return 'Window expired without a decision';
      default:
        return 'Decision recorded';
    }
  }
  if (facts.denied) return 'Refused (no approval recorded)';
  if (facts.allowed) return 'Not required (trusted scope)';
  return 'Not recorded';
}

/**
 * Rows that are a person's own act rather than the assistant's. Everything else runs through the
 * assistant, which is exactly the distinction the minute says the published page could not make
 * («只显示 Admin，分不清 AI 与人»).
 *
 * 这些行是**人**自己的动作，不是助手的。其余都经助手执行 —— 正是纪要说已发布页面分不清的那条界线
 * （「只显示 Admin，分不清 AI 与人」）。
 */
const HUMAN_ONLY_ACTIONS = new Set(['audit_review', 'claim_release', 'login']);

/**
 * The Initiated-by cell: the person, plus whether the action ran through the assistant or was their
 * own direct act. A delegated agent execution is a third state and says so.
 *
 * 发起人列：人 + 这次动作是经助手执行，还是本人的直接动作。代理执行是第三种，并如实说出来。
 */
export function productInitiatorLabel(row: {
  username?: string | null;
  action: string;
  agentId?: string | null;
}): string {
  const name = row.username?.trim();
  if (!name) return 'Not recorded';
  if (row.agentId) return `${name} (through the AI assistant, delegated)`;
  if (HUMAN_ONLY_ACTIONS.has(row.action)) return `${name} (directly)`;
  return `${name} (through the AI assistant)`;
}

/**
 * The six column headers, in the minute's order: 时间 / 动作 / 结果 / 对象 / 授权 / 发起人.
 *
 * 六个列头，按纪要顺序：时间 / 动作 / 结果 / 对象 / 授权 / 发起人。
 */
export const ANSWER_HEADERS: readonly string[] = [
  // The clock is named: the console renders local time, and an export that silently means UTC is a
  // way to disagree with the screen while both look right.
  // 钟面写明白：控制台显示本地时间，一份悄悄按 UTC 的导出，是让两边看起来都对却对不上的办法。
  'Time (UTC)',
  'Action',
  'Result',
  'Object',
  'Authorization',
  'Initiated by',
];
