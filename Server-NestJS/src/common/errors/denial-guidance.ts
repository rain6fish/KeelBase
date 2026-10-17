// SPDX-License-Identifier: Apache-2.0

/**
 * Trust-grade denial guidance: why a request was refused + how to make it pass.
 *
 * This is the single constructor for the `explanation` object used by:
 * - the existing 403 Explainable Authz path (`PoliciesGuard`),
 * - AI tool-gate refusals (policy / R5 / role / scope / approval),
 * - confirmation timeouts and unusable confirmation tokens.
 *
 * Shape is additive to the 403 sample `{ deniedBy, reason }`: `reasonKey` / `nextStepKey` are stable
 * i18n keys, `reason` / `nextStep` are already localized for immediate display, and `params` carries
 * the values a client needs to re-render the text in its own language. No second error shape.
 *
 * 信任化拒绝指引：为什么被拒 + 怎样才能通过。
 *
 * 本文件是 `explanation` 对象的**唯一构造器**，供：既有 403 Explainable Authz（`PoliciesGuard`）、
 * AI 工具门控拒绝（策略 / R5 / 角色 / 范围 / 审批）、确认超时与不可用的确认 token 共用。
 *
 * 形状在 403 样板 `{ deniedBy, reason }` 之上**纯加性**：`reasonKey` / `nextStepKey` 是稳定 i18n key，
 * `reason` / `nextStep` 是已本地化文案（可立即展示），`params` 携带客户端自行翻译所需的取值。
 * **不另造第二套错误形状。**
 */

export type DenialLanguage = 'zh' | 'en';

export type DenialDeniedBy = 'risk_policy' | 'governance' | 'confirmation' | 'casl';

/**
 * Stable refusal kinds. One kind per gate that can say no; the union keeps producers and the
 * catalogue from drifting apart.
 *
 * 稳定的拒绝类别。每道会说「不」的闸一个类别；联合类型保证生产方与文案目录不会各自漂移。
 */
export type DenialKind =
  | 'risk_r5'
  | 'tool_disabled'
  | 'role_denied'
  | 'feature_disabled'
  | 'admin_only'
  | 'destination_denied'
  | 'field_out_of_domain'
  | 'field_out_of_bound'
  | 'approval_missing'
  | 'destination_changed'
  | 'agent_read_only'
  | 'confirmation_timeout'
  | 'confirmation_invalid'
  | 'casl_admin'
  | 'casl_user';

/** Values interpolated into the localized text and returned to clients for their own rendering. */
export type DenialParams = Record<string, string | number>;

/**
 * What a refusal producer attaches to its error: the kind plus the values the boundary needs to
 * render the explanation in the request language. Producers stay language-agnostic; localization
 * happens where the response is written.
 *
 * 拒绝生产方挂在错误上的内容：类别 + 边界渲染解释所需的取值。生产方不关心语言；本地化发生在
 * 写响应的那一层。
 */
export interface DenialCause {
  kind: DenialKind;
  params?: DenialParams;
}

/**
 * The one `explanation` shape (403 + tool denials + confirmation timeout/invalid).
 *
 * `reason` / `nextStep` are localized by the caller's `Accept-Language`; `reasonKey` / `nextStepKey`
 * let a client ignore the server text and render the same sentence from its own catalogue.
 *
 * 唯一的 `explanation` 形状（403 + 工具拒绝 + 确认超时/失效）。
 *
 * `reason` / `nextStep` 按调用方 `Accept-Language` 本地化；客户端也可忽略服务端文案，用
 * `reasonKey` / `nextStepKey` 从自己的文案表渲染同一句话。
 */
export interface DenialExplanation {
  deniedBy: DenialDeniedBy;
  reasonKey: string;
  nextStepKey: string;
  reason: string;
  nextStep: string;
  params?: DenialParams;
}

interface GuidanceText {
  zh: string;
  en: string;
}

interface GuidanceEntry {
  deniedBy: DenialDeniedBy;
  reasonKey: string;
  nextStepKey: string;
  reason: GuidanceText;
  nextStep: GuidanceText;
}

/**
 * Catalogue of refusal texts. Keep each next step actionable: name the screen, the role, or the
 * concrete retry, not "contact support".
 *
 * 拒绝文案目录。每条 next step 都必须可执行：点名界面、角色或具体重试动作，不写「联系支持」。
 */
const GUIDANCE: Record<DenialKind, GuidanceEntry> = {
  // R5 is blocked unconditionally — the honest next step is a different tool or a human-run operation.
  // R5 恒阻断 —— 诚实的下一步是换工具或由人工执行。
  risk_r5: {
    deniedBy: 'risk_policy',
    reasonKey: 'ai.deny.risk_r5.reason',
    nextStepKey: 'ai.deny.risk_r5.nextStep',
    reason: {
      zh: '工具「{tool}」的风险级为 R5（不可逆或外部动作），系统策略恒定阻断，任何治理策略都不能放行。',
      en: 'Tool "{tool}" is risk level R5 (irreversible or external action). The system blocks it unconditionally, and no governance policy can allow it.',
    },
    nextStep: {
      zh: '请改用可逆的低风险工具完成同一目标；确需此操作时，由管理员按运维流程人工执行并保留审计记录。',
      en: 'Use a reversible lower-risk tool for the same goal. If the operation is truly required, have an administrator perform it manually under the operations process and keep an audit record.',
    },
  },
  tool_disabled: {
    deniedBy: 'governance',
    reasonKey: 'ai.deny.tool_disabled.reason',
    nextStepKey: 'ai.deny.tool_disabled.nextStep',
    reason: {
      zh: '治理策略已禁用工具「{tool}」。',
      en: 'Governance policy has disabled tool "{tool}".',
    },
    nextStep: {
      zh: '请管理员在「AI 工具治理 → 策略中心」启用该工具后重试。',
      en: 'Ask an administrator to enable this tool in AI Tool Governance → Policy Center, then retry.',
    },
  },
  role_denied: {
    deniedBy: 'governance',
    reasonKey: 'ai.deny.role_denied.reason',
    nextStepKey: 'ai.deny.role_denied.nextStep',
    reason: {
      zh: '工具「{tool}」仅允许角色 {allowedRoles} 调用；当前角色为 {currentRole}。',
      en: 'Tool "{tool}" is restricted to roles {allowedRoles}; the current role is {currentRole}.',
    },
    nextStep: {
      zh: '请管理员把当前角色加入该工具的角色白名单，或换用具备 {allowedRoles} 角色的账号。',
      en: 'Ask an administrator to add the current role to this tool\'s allowed roles, or use an account with one of these roles: {allowedRoles}.',
    },
  },
  feature_disabled: {
    deniedBy: 'governance',
    reasonKey: 'ai.deny.feature_disabled.reason',
    nextStepKey: 'ai.deny.feature_disabled.nextStep',
    reason: {
      zh: '特性开关「{featureFlag}」已关闭，工具「{tool}」当前不可用。',
      en: 'Feature flag "{featureFlag}" is off, so tool "{tool}" is unavailable.',
    },
    nextStep: {
      zh: '请管理员启用特性开关「{featureFlag}」后重试。',
      en: 'Ask an administrator to enable feature flag "{featureFlag}", then retry.',
    },
  },
  admin_only: {
    deniedBy: 'governance',
    reasonKey: 'ai.deny.admin_only.reason',
    nextStepKey: 'ai.deny.admin_only.nextStep',
    reason: {
      zh: '工具「{tool}」仅限管理员使用。',
      en: 'Tool "{tool}" is restricted to administrators.',
    },
    nextStep: {
      zh: '请使用管理员账号，或请管理员在管理台执行该操作。',
      en: 'Use an administrator account, or ask an administrator to perform the operation in the admin console.',
    },
  },
  destination_denied: {
    deniedBy: 'governance',
    reasonKey: 'ai.deny.destination_denied.reason',
    nextStepKey: 'ai.deny.destination_denied.nextStep',
    reason: {
      zh: '工具「{tool}」不允许写入目的地「{destination}」；允许的目的地为 {allowedDestinations}。',
      en: 'Tool "{tool}" may not write to destination "{destination}"; allowed destinations: {allowedDestinations}.',
    },
    nextStep: {
      zh: '请管理员把「{destination}」加入该工具的目的地白名单，或改用允许的目的地。',
      en: 'Ask an administrator to add "{destination}" to this tool\'s allowed destinations, or use an allowed destination.',
    },
  },
  field_out_of_domain: {
    deniedBy: 'governance',
    reasonKey: 'ai.deny.field_out_of_domain.reason',
    nextStepKey: 'ai.deny.field_out_of_domain.nextStep',
    reason: {
      zh: '本次参数包含可写域之外的字段：{outOfDomain}；可写字段为 {writableFields}。',
      en: 'The arguments include fields outside the writable domain: {outOfDomain}; writable fields: {writableFields}.',
    },
    nextStep: {
      zh: '请移除这些字段，只提交可写字段后重试；确需修改它们时请管理员调整可写域。',
      en: 'Remove these fields and retry with writable fields only; if they must be changed, ask an administrator to extend the writable domain.',
    },
  },
  field_out_of_bound: {
    deniedBy: 'governance',
    reasonKey: 'ai.deny.field_out_of_bound.reason',
    nextStepKey: 'ai.deny.field_out_of_bound.nextStep',
    reason: {
      zh: '字段「{field}」的取值超出声明界限（须为不超过 {max} 的有限数）。',
      en: 'Field "{field}" is outside its declared bound (a finite number not greater than {max}).',
    },
    nextStep: {
      zh: '请把「{field}」调整到 {max} 以内再重试。',
      en: 'Adjust "{field}" to a value not greater than {max}, then retry.',
    },
  },
  approval_missing: {
    deniedBy: 'governance',
    reasonKey: 'ai.deny.approval_missing.reason',
    nextStepKey: 'ai.deny.approval_missing.nextStep',
    reason: {
      zh: '工具「{tool}」当前要求人工审批，而本次执行持有的凭据不是第二位审批人的批准（策略可能在等待窗口内升档）。',
      en: 'Tool "{tool}" currently requires human approval, and this execution does not hold a second approver\'s approval (the policy may have been raised during the wait window).',
    },
    nextStep: {
      zh: '请重新发起该操作并等待第二位审批人批准；发起人自己的确认不能替代 R4 审批。',
      en: 'Re-submit the operation and wait for a second approver; the initiator\'s own confirmation cannot stand in for R4 approval.',
    },
  },
  destination_changed: {
    deniedBy: 'governance',
    reasonKey: 'ai.deny.destination_changed.reason',
    nextStepKey: 'ai.deny.destination_changed.nextStep',
    reason: {
      zh: '工具「{tool}」的目的地在确认签发后已从「{confirmedFor}」变为「{current}」，这张确认不能跨目的地复用。',
      en: 'Tool "{tool}" changed destination from "{confirmedFor}" to "{current}" after the confirmation was issued; that confirmation cannot be reused across destinations.',
    },
    nextStep: {
      zh: '请按当前目的地重新发起操作并重新确认。',
      en: 'Re-submit the operation for the current destination and confirm it again.',
    },
  },
  agent_read_only: {
    deniedBy: 'governance',
    reasonKey: 'ai.deny.agent_read_only.reason',
    nextStepKey: 'ai.deny.agent_read_only.nextStep',
    reason: {
      zh: '工具「{tool}」是写操作或需人工确认；plan / 子代理步骤只读执行，不能执行它。',
      en: 'Tool "{tool}" is a write or confirmation-gated operation; plan and sub-agent steps are read-only and cannot run it.',
    },
    nextStep: {
      zh: '请在主对话中发起该操作，并按确认卡批准后执行。',
      en: 'Start the operation in the main conversation and approve it on the confirmation card.',
    },
  },
  confirmation_timeout: {
    deniedBy: 'confirmation',
    reasonKey: 'ai.deny.confirmation_timeout.reason',
    nextStepKey: 'ai.deny.confirmation_timeout.nextStep',
    reason: {
      zh: '工具「{tool}」的确认窗口（{ttlSeconds} 秒）内没有收到裁决。',
      en: 'No decision was received for tool "{tool}" within the confirmation window ({ttlSeconds} seconds).',
    },
    nextStep: {
      zh: '请重新发起该操作并在窗口内批准；若已离开对话，请在「待我确认」中心于 {offlineTtlHours} 小时内裁决。',
      en: 'Re-submit the operation and approve it within the window. If you left the conversation, decide it in the Action Center within {offlineTtlHours} hours.',
    },
  },
  confirmation_invalid: {
    deniedBy: 'confirmation',
    reasonKey: 'ai.deny.confirmation_invalid.reason',
    nextStepKey: 'ai.deny.confirmation_invalid.nextStep',
    reason: {
      zh: '确认请求不存在、已过期、已被裁决，或不属于当前账号。',
      en: 'The confirmation request does not exist, has expired, has already been decided, or does not belong to this account.',
    },
    nextStep: {
      zh: '请重新发起该操作；若已在其他设备或「待我确认」中心处理，请回到原入口查看结果。',
      en: 'Re-submit the operation. If it was handled on another device or in the Action Center, check the result there.',
    },
  },
  casl_admin: {
    deniedBy: 'casl',
    reasonKey: 'ai.deny.casl_admin.reason',
    nextStepKey: 'ai.deny.casl_admin.nextStep',
    reason: {
      zh: '当前策略不允许此操作。',
      en: 'The current policy does not allow this operation.',
    },
    nextStep: {
      zh: '请核对该操作所需的角色策略并调整后再试。',
      en: 'Review and adjust the role policy required for this operation, then retry.',
    },
  },
  casl_user: {
    deniedBy: 'casl',
    reasonKey: 'ai.deny.casl_user.reason',
    nextStepKey: 'ai.deny.casl_user.nextStep',
    reason: {
      zh: '需要管理员权限，或该操作不在你的角色范围内。',
      en: 'Administrator privileges are required, or this operation is outside your role.',
    },
    nextStep: {
      zh: '请切换管理员账号，或请管理员调整你的角色权限。',
      en: 'Switch to an administrator account, or ask an administrator to adjust your role permissions.',
    },
  },
};

/**
 * Map a failing authorization check to its guidance kind. The check names are the vocabulary the
 * gate and the audit trail already use (`AuthorizationCheck.name`), so there is no second enum.
 *
 * 把失败的授权检查映射到指引类别。检查名就是门控与审计已在用的词汇（`AuthorizationCheck.name`），
 * 不另建第二个枚举。
 */
const CHECK_TO_KIND: Record<string, DenialKind> = {
  risk_policy: 'risk_r5',
  tool_enabled: 'tool_disabled',
  role_allowed: 'role_denied',
  feature_flag: 'feature_disabled',
  admin_only: 'admin_only',
  destination_allowed: 'destination_denied',
  field_domain: 'field_out_of_domain',
  field_bound: 'field_out_of_bound',
  approval_missing: 'approval_missing',
  destination_binding: 'destination_changed',
  agent_read_only: 'agent_read_only',
};

export function denialKindForCheck(checkName: string): DenialKind | undefined {
  return CHECK_TO_KIND[checkName];
}

/** Replace `{name}` placeholders; unknown names are left untouched so a bug is visible, not silent. */
function interpolate(template: string, params?: DenialParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

/**
 * Build the shared `explanation` object. `lang` is the request language when the caller knows it;
 * English is the default so an API without `Accept-Language` still gets a complete answer.
 *
 * 构造共享的 `explanation` 对象。调用方知道请求语言时传入 `lang`；默认英文，使没有
 * `Accept-Language` 的调用也拿到完整答案。
 */
export function buildDenialExplanation(
  kind: DenialKind,
  params?: DenialParams,
  lang: DenialLanguage = 'en',
): DenialExplanation {
  const def = GUIDANCE[kind];
  const explanation: DenialExplanation = {
    deniedBy: def.deniedBy,
    reasonKey: def.reasonKey,
    nextStepKey: def.nextStepKey,
    reason: interpolate(def.reason[lang], params),
    nextStep: interpolate(def.nextStep[lang], params),
  };
  if (params && Object.keys(params).length > 0) {
    explanation.params = params;
  }
  return explanation;
}

/**
 * Pick the response language from an `Accept-Language` header. Shared by the HTTP error filter and
 * every refusal producer, so "zh prefix → Chinese, everything else → English" has one definition.
 *
 * 从 `Accept-Language` 头选择响应语言。HTTP 错误过滤器与所有拒绝生产方共用，使
 * 「zh 开头 → 中文，其余 → 英文」只有一处定义。
 */
export function pickLanguageFromHeader(value: string | string[] | undefined): DenialLanguage {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
