// SPDX-License-Identifier: Apache-2.0

/**
 * §22.16 A-4 审计解释器（Audit Interpreter）：把技术审计记录翻译成业务语言摘要。
 * 纯函数、无 DI——demo 可用（聚合真实审计表数据，不依赖 LLM）。
 * 三层：L1 业务摘要句 / L2 证据统计（aggregateConversation）/ L3 技术详情（前端保留 detail）。
 */

export interface AuditEvidence {
  decision?: string;
  evidence?: string[];
  policy?: string;
  confidence?: number;
}

export interface AuditInterpreterStats {
  /** 对话内业务事件计数（FollowupTaskCreated 等） */
  businessEvents: Array<{ event: string; count: number }>;
  /** analyze_* 的 DecisionEvidence 明细 */
  evidence: AuditEvidence[];
  /** 对话内人工确认分布 */
  confirmations: { approved: number; declined: number };
  /** 被安全策略阻断数 */
  blocked: number;
  /** 错误数 */
  errors: number;
}

export interface AuditInterpretation {
  /** L1 业务语言摘要句 */
  sentence: string;
  /** 语义 key（前端 i18n）；null 时直接用 sentence */
  key: string | null;
  businessEvent: string | null;
  /** L2 证据统计 */
  stats: AuditInterpreterStats;
}

/** 审计行（getInterpretation 传入的 AiAuditLog 投影子集） */
export interface AuditInterpretationRow {
  userId: string;
  username?: string | null;
  action: string;
  detail?: string | null;
  businessEvent?: string | null;
  evidence?: string | null;
  isError?: boolean;
  errorMessage?: string | null;
}

const BLOCKED_RE = /blocked|denied|拒绝|越狱|越权|R5|禁用|禁止|无权/i;

/** L1：单行审计 → 业务语言摘要句。按 toolName 分派模板，未覆盖 action 走兜底。 */
export function summarizeAudit(row: AuditInterpretationRow, convRows: AuditInterpretationRow[]): AuditInterpretation {
  const stats = aggregateConversation(convRows);
  const username = row.username || `用户#${row.userId}`;
  const { toolName } = parseToolCall(row.detail);

  let sentence: string;
  if (row.action === 'tool_confirmation') {
    // 确认决策优先于工具名（create_event 的 confirmation 记录不是写操作）
    const { outcome } = parseConfirmation(row.detail);
    sentence = `${username}${outcome === 'approve' ? '批准' : outcome === 'decline' ? '拒绝' : '确认超时'}了该操作`;
  } else if (row.action === 'content_blocked' || (row.action === 'tool_call' && row.isError && BLOCKED_RE.test(row.errorMessage ?? ''))) {
    sentence = `${username}的操作被安全策略阻断`;
  } else if (row.action === 'flow_node') {
    // A-7 审批链入审计：从 evidence 还原流程事件（发起/节点/审批通过/驳回/完成）
    sentence = summarizeFlowNode(username, row);
  } else if (toolName === 'analyze_customer_risk' || toolName === 'analyze_project_risk') {
    const ev = parseEvidence(row.evidence);
    sentence = ev
      ? `${username}对业务做风险分析：等级${ev.decision ?? '未知'}，${ev.evidence?.length ?? 0}条依据，置信${ev.confidence != null ? ev.confidence.toFixed(2) : '-'}`
      : `${username}执行风险分析`;
  } else if (toolName && /^(create|submit)_/.test(toolName)) {
    sentence = `${username}${row.businessEvent ? `执行「${row.businessEvent}」` : '执行写操作'}`;
  } else {
    sentence = `${username}执行${row.action}，${row.isError ? '失败' : '完成'}`;
  }

  return { sentence, key: null, businessEvent: row.businessEvent ?? null, stats };
}

/** L2：对话级证据统计——businessEvent 计数 / DecisionEvidence 明细 / 确认分布 / 阻断 / 错误。 */
export function aggregateConversation(convRows: AuditInterpretationRow[]): AuditInterpreterStats {
  const businessEvents = new Map<string, number>();
  const evidence: AuditEvidence[] = [];
  const confirmations = { approved: 0, declined: 0 };
  let blocked = 0;
  let errors = 0;

  for (const r of convRows) {
    if (r.businessEvent) businessEvents.set(r.businessEvent, (businessEvents.get(r.businessEvent) ?? 0) + 1);
    if (r.evidence) {
      const ev = parseEvidence(r.evidence);
      if (ev) evidence.push(ev);
    }
    if (r.action === 'tool_confirmation') {
      const { outcome } = parseConfirmation(r.detail);
      if (outcome === 'approve') confirmations.approved++;
      if (outcome === 'decline') confirmations.declined++;
    }
    if (r.action === 'content_blocked' || (r.action === 'tool_call' && r.isError && BLOCKED_RE.test(r.errorMessage ?? ''))) blocked++;
    if (r.isError) errors++;
  }

  return {
    businessEvents: Array.from(businessEvents.entries()).map(([event, count]) => ({ event, count })),
    evidence,
    confirmations,
    blocked,
    errors,
  };
}

/** flow_node evidence 结构：{ event: start|node|resolve|completed; decision?: approve|reject; definitionName?; nodeName? } */
interface FlowNodeEvidence {
  event?: string;
  decision?: string;
  definitionName?: string | null;
  nodeName?: string | null;
}

function parseFlowEvidence(raw?: string | null): FlowNodeEvidence | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FlowNodeEvidence;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function summarizeFlowNode(username: string, row: AuditInterpretationRow): string {
  const ev = parseFlowEvidence(row.evidence);
  if (!ev) return `${username}执行流程节点，${row.isError ? '失败' : '完成'}`;
  if (ev.event === 'start') return `${username}发起流程${ev.definitionName ? `「${ev.definitionName}」` : ''}`;
  if (ev.event === 'completed') return `流程${ev.definitionName ? `「${ev.definitionName}」` : ''}已完成`;
  if (ev.event === 'node') return `${username}进入流程节点${ev.nodeName ? `「${ev.nodeName}」` : ''}`;
  if (ev.decision === 'approve') return `${username}审批通过${ev.nodeName ? `「${ev.nodeName}」` : ''}`;
  if (ev.decision === 'reject') return `${username}驳回${ev.nodeName ? `「${ev.nodeName}」` : ''}`;
  return `${username}执行流程操作，${row.isError ? '失败' : '完成'}`;
}

function parseEvidence(raw?: string | null): AuditEvidence | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuditEvidence;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** detail 形如 `analyze_customer_risk({"id":7})` → 工具名 */
function parseToolCall(detail?: string | null): { toolName: string } {
  if (!detail) return { toolName: '' };
  const m = /^([a-z_]+)\(/.exec(detail);
  return { toolName: m ? m[1] : '' };
}

/** detail 形如 `create_followup_task({...}) → approve` → 确认结果 */
function parseConfirmation(detail?: string | null): { outcome: 'approve' | 'decline' | 'timeout' } {
  const m = /^[\w]+\(.*\)\s*→\s*(\w+)/.exec(detail || '');
  const raw = m?.[1];
  return { outcome: raw === 'approve' ? 'approve' : raw === 'decline' ? 'decline' : 'timeout' };
}
