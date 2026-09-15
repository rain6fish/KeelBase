// SPDX-License-Identifier: Apache-2.0

/**
 * §internal.16 A-4 审计解释器（Audit Interpreter）：把技术审计记录翻译成业务语言摘要。
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
  /** D-3 人读「决策说明」（仅当该行有授权快照时附；否则省略，避免每行噪音） */
  decisionNote?: AuthorizationNote;
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
  /** W5-⑦ 授权快照（放行对象 / 拒绝 checks 数组的 JSON；无快照为 null） */
  authorization?: string | null;
}

/** P-③ 策略回放三态（由调用方注入——回放需查 policy-history，非纯函数职责）。 */
export type AuthzReplayState = 'consistent' | 'drift' | 'unavailable';
export interface AuthzReplay {
  state: AuthzReplayState;
  /** 人读附注（如「策略 a1b2 → c3d4」） */
  note?: string | null;
}

/**
 * D-3 人读「决策说明」：把授权快照（技术结构）翻成审计员读得懂的「凭什么允许 / 为何拒绝」。
 * 只反映快照记录——缺字段如实标注，**不推断、不回填**（确定性模板，非 LLM）。
 */
export interface AuthorizationNote {
  decision: 'allow' | 'deny' | 'unknown';
  /** 人读说明句（中文默认） */
  sentence: string;
  /** 语义 key（前端 i18n）：authz.allow / authz.deny / authz.unknown */
  key: string;
  /** 角色（快照记录则给，否则 null） */
  role: string | null;
  /** 行级范围人读（如 user_scoped（仅本人数据）） */
  scope: string | null;
  policyRevision: string | null;
  policyUpdatedAt: string | null;
  checks: Array<{ name: string; ok: boolean; note?: string }>;
  failedChecks: Array<{ name: string; ok: boolean; note?: string }>;
  /** 拒绝原因（failed checks 的 note 汇总） */
  reasons: string | null;
  /** P-③ 回放（null = 本次未计算；allow 且快照无 revision → unavailable） */
  replay: AuthzReplay | null;
}

const BLOCKED_RE = /blocked|denied|拒绝|越狱|越权|R5|禁用|禁止|无权/i;

/** A-8 越权尝试特征（数据级：AI 试图访问/操作他人数据，工具内 ForbiddenException，authorization 列为 null） */
const UNAUTHORIZED_RE = /越权|无权|403|permission|access|不是你的|不是属主|其他用户|不属于/i;

/** A-8 高风险动作阻断（R5 不可逆/外部动作，errorMessage 含 blocked + R5） */
const HIGH_RISK_RE = /R5|不可逆|高风险|blocked/i;

/** L1：单行审计 → 业务语言摘要句。按 toolName 分派模板，未覆盖 action 走兜底。 */
export function summarizeAudit(
  row: AuditInterpretationRow,
  convRows: AuditInterpretationRow[],
  ctx?: { replay?: AuthzReplay | null },
): AuditInterpretation {
  const stats = aggregateConversation(convRows);
  const username = row.username || `用户#${row.userId}`;
  const { toolName } = parseToolCall(row.detail);

  let sentence: string;
  if (row.action === 'tool_confirmation') {
    // 确认决策优先于工具名（create_event 的 confirmation 记录不是写操作）
    const { outcome } = parseConfirmation(row.detail);
    sentence = `${username}${outcome === 'approve' ? '批准' : outcome === 'decline' ? '拒绝' : '确认超时'}了该操作`;
  } else if (row.action === 'content_blocked' || (row.action === 'tool_call' && row.isError && BLOCKED_RE.test(row.errorMessage ?? ''))) {
    // A-8 越权尝试一级事件业务化：区分「越权尝试 / 高风险阻断 / 通用阻断」——「AI 没做什么」同样是安全证据
    const msg = row.errorMessage ?? '';
    if (UNAUTHORIZED_RE.test(msg) && !HIGH_RISK_RE.test(msg)) {
      sentence = `${username}的 AI 尝试访问受限数据，已被策略拒绝（越权尝试）`;
    } else if (HIGH_RISK_RE.test(msg)) {
      sentence = `${username}的 AI 尝试高风险操作，已被安全策略阻断`;
    } else {
      sentence = `${username}的操作被安全策略阻断`;
    }
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

  // D-3：该行有授权快照时附人读「决策说明」（无快照不附——避免每行「未记录」噪音；
  // 需强制产出 unknown 说明的调用方直接调 explainAuthorization）
  const hasSnapshot = typeof row.authorization === 'string' && row.authorization.length > 0;
  return {
    sentence,
    key: null,
    businessEvent: row.businessEvent ?? null,
    stats,
    ...(hasSnapshot ? { decisionNote: explainAuthorization(row, ctx?.replay ?? null) } : {}),
  };
}

const SCOPE_CHECK_RE = /scope|owner|own\b|本人|属主/i;
const ROLE_CHECK_RE = /role|角色/i;

/** checks 里挑范围/角色依据（人读短语）；无则 null（不推断）。 */
function pickScope(checks: Array<{ name: string; ok: boolean; note?: string }>): string | null {
  const c = checks.find((x) => x && SCOPE_CHECK_RE.test(x.name ?? ''));
  return c ? (c.note ? `${c.name}（${c.note}）` : c.name) : null;
}
function pickRole(checks: Array<{ name: string; ok: boolean; note?: string }>): string | null {
  const c = checks.find((x) => x && ROLE_CHECK_RE.test(x.name ?? ''));
  return c ? (c.note ?? c.name) : null;
}

const REPLAY_KEY: Record<AuthzReplayState, string> = {
  consistent: 'authz.replay.consistent',
  drift: 'authz.replay.drift',
  unavailable: 'authz.replay.unavailable',
};
const REPLAY_LABEL: Record<AuthzReplayState, string> = {
  consistent: '一致',
  drift: '检出漂移',
  unavailable: '不可回放',
};
/** 回放附注语义 key（供前端 i18n）。 */
export function replayKey(state: AuthzReplayState): string {
  return REPLAY_KEY[state];
}

/**
 * D-3：授权快照 → 人读「决策说明」（句子 + 语义 key + 结构化字段）。
 * - 允许：对象快照（`allowed !== false`）→ 角色/范围/策略版本/检查 + 回放附注；
 * - 拒绝：数组快照（`AuthorizationDeniedError.reasons`）→ 未过检查 + 原因；
 * - 无快照/不可解析：`decision:'unknown'`，句含「未记录」，**不推断**。
 * `replay` 由调用方注入（回放需查 policy-history，非纯函数职责）；未注入且快照无 revision → unavailable。
 */
export function explainAuthorization(
  row: AuditInterpretationRow,
  replay: AuthzReplay | null = null,
): AuthorizationNote {
  const username = row.username || `用户#${row.userId}`;
  const raw = parseAuthorizationRaw(row.authorization);

  // 拒绝：AuthorizationDeniedError.reasons（checks 数组）
  if (Array.isArray(raw)) {
    const checks = (raw as Array<{ name: string; ok: boolean; note?: string }>).filter((c) => c && typeof c.name === 'string');
    const failed = checks.filter((c) => c.ok === false);
    const reasons = failed.map((c) => c.note ?? c.name).filter(Boolean).join('；') || null;
    const failedNames = failed.map((c) => c.name).join('、') || '(未记名)';
    return {
      decision: 'deny',
      key: 'authz.deny',
      sentence: `${username}的该操作被拒绝：检查=${failedNames}未过${reasons ? `（原因：${reasons}）` : ''}`,
      role: null,
      scope: null,
      policyRevision: null,
      policyUpdatedAt: null,
      checks,
      failedChecks: failed,
      reasons,
      replay: null,
    };
  }

  // 允许：对象快照（allowed !== false）
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as {
      allowed?: boolean;
      role?: string | null;
      checks?: unknown;
      policy?: { revision?: string; updatedAt?: string | null } | null;
    };
    if (o.allowed !== false) {
      const checks = Array.isArray(o.checks)
        ? (o.checks as Array<{ name: string; ok: boolean; note?: string }>).filter((c) => c && typeof c.name === 'string')
        : [];
      const failed = checks.filter((c) => c.ok === false);
      const role = o.role ?? pickRole(checks);
      const scope = pickScope(checks);
      const rev = o.policy?.revision ?? null;
      const upd = o.policy?.updatedAt ?? null;
      const parts: string[] = [];
      if (role) parts.push(`角色=${role}`);
      if (scope) parts.push(`范围=${scope}`);
      if (rev) parts.push(`策略版本=${rev}${upd ? `（更新于 ${upd}）` : ''}`);
      if (checks.length) parts.push(`检查=${checks.map((c) => `${c.name}${c.ok ? '✓' : '✗'}`).join(' / ')}`);

      // 回放：调用方注入优先；无 revision → unavailable（如实降级）；有 revision 未注入 → null（本次未计算）
      let replayOut: AuthzReplay | null = replay;
      if (replayOut == null) replayOut = rev ? null : { state: 'unavailable', note: '快照未含策略版本' };
      const replayClause = replayOut ? `；按当时策略回放：${REPLAY_LABEL[replayOut.state]}` : '';

      return {
        decision: 'allow',
        key: 'authz.allow',
        sentence: `允许：${parts.join('，') || '（快照未记录细节）'}${replayClause}`,
        role,
        scope,
        policyRevision: rev,
        policyUpdatedAt: upd,
        checks,
        failedChecks: failed,
        reasons: null,
        replay: replayOut,
      };
    }
  }

  // 无快照 / 不可解析
  return {
    decision: 'unknown',
    key: 'authz.unknown',
    sentence: '未记录授权依据（该动作早于快照或非治理路径）',
    role: null,
    scope: null,
    policyRevision: null,
    policyUpdatedAt: null,
    checks: [],
    failedChecks: [],
    reasons: null,
    replay: null,
  };
}

function parseAuthorizationRaw(raw?: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
