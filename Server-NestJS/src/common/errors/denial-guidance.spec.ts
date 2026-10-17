// SPDX-License-Identifier: Apache-2.0

import {
  buildDenialExplanation,
  denialKindForCheck,
  pickLanguageFromHeader,
  type DenialKind,
  type DenialParams,
} from './denial-guidance';

/**
 * The shared `explanation` shape must stay complete for every refusal kind: a stable key, a
 * localized why, a localized next step, and the params a client needs to translate it itself.
 *
 * 共享 `explanation` 形状对每个拒绝类别都必须完整：稳定 key、本地化的「为什么」、本地化的
 * 「怎么解决」，以及客户端自行翻译所需的参数。
 */
const PARAMS: Record<DenialKind, DenialParams> = {
  risk_r5: { tool: 'delete_customer' },
  tool_disabled: { tool: 'create_event' },
  role_denied: { tool: 'create_event', allowedRoles: 'admin, ops', currentRole: 'user' },
  feature_disabled: { tool: 'create_event', featureFlag: 'ai' },
  admin_only: { tool: 'navigate_admin_page' },
  destination_denied: { tool: 'send_invoice', destination: 'local', allowedDestinations: 'legacy-erp' },
  field_out_of_domain: { tool: 'update_ticket', outOfDomain: 'owner', writableFields: 'status, priority' },
  field_out_of_bound: { tool: 'create_invoice', field: 'amount', max: 10000 },
  approval_missing: { tool: 'create_task' },
  destination_changed: { tool: 'send_invoice', confirmedFor: 'legacy-erp', current: 'legacy-crm' },
  agent_read_only: { tool: 'create_event' },
  confirmation_timeout: { tool: 'create_todo', ttlSeconds: 60, offlineTtlHours: 24 },
  confirmation_invalid: {},
  casl_admin: { role: 'admin' },
  casl_user: { role: 'user' },
};

const KINDS = Object.keys(PARAMS) as DenialKind[];

describe('denial-guidance › shared explanation shape', () => {
  it.each(KINDS)('%s：中英文都给出 key + 已插值文案，且不留占位符', (kind) => {
    const params = PARAMS[kind];
    for (const lang of ['en', 'zh'] as const) {
      const e = buildDenialExplanation(kind, params, lang);
      expect(e.reasonKey).toMatch(/^ai\.deny\.[a-z0-9_]+\.reason$/);
      expect(e.nextStepKey).toMatch(/^ai\.deny\.[a-z0-9_]+\.nextStep$/);
      expect(e.reasonKey.slice(0, -'.reason'.length)).toBe(
        e.nextStepKey.slice(0, -'.nextStep'.length),
      );
      expect(e.reason.length).toBeGreaterThan(10);
      expect(e.nextStep.length).toBeGreaterThan(10);
      expect(e.reason).not.toContain('{');
      expect(e.nextStep).not.toContain('{');
      // Params are returned only when there is something to translate.
      if (Object.keys(params).length > 0) {
        expect(e.params).toEqual(params);
      } else {
        expect(e.params).toBeUndefined();
      }
    }
  });

  it('英文与中文确实是两套文案（不是同一句）', () => {
    for (const kind of KINDS) {
      const zh = buildDenialExplanation(kind, PARAMS[kind], 'zh');
      const en = buildDenialExplanation(kind, PARAMS[kind], 'en');
      expect(zh.reason).not.toBe(en.reason);
      expect(zh.nextStep).not.toBe(en.nextStep);
    }
  });

  it('deniedBy 区分来源：R5=risk、策略=governance、超时=confirmation、CASL=casl', () => {
    expect(buildDenialExplanation('risk_r5', PARAMS.risk_r5).deniedBy).toBe('risk_policy');
    expect(buildDenialExplanation('tool_disabled', PARAMS.tool_disabled).deniedBy).toBe(
      'governance',
    );
    expect(
      buildDenialExplanation('confirmation_timeout', PARAMS.confirmation_timeout).deniedBy,
    ).toBe('confirmation');
    expect(buildDenialExplanation('casl_user', PARAMS.casl_user).deniedBy).toBe('casl');
  });

  it('R5 的「怎么解决」是可执行的：换低风险工具或人工按审计执行，且不承诺策略可放宽', () => {
    const e = buildDenialExplanation('risk_r5', PARAMS.risk_r5, 'zh');
    expect(e.reason).toContain('R5');
    expect(e.nextStep).toContain('低风险工具');
    expect(e.nextStep).toContain('管理员');
    expect(e.reason).not.toMatch(/SELECT|stack|C:\\|password/i);
  });

  it('确认超时带窗口与离线窗口读数（可直接告诉用户等多久）', () => {
    const zh = buildDenialExplanation('confirmation_timeout', PARAMS.confirmation_timeout, 'zh');
    expect(zh.reason).toContain('60');
    expect(zh.nextStep).toContain('24');
    expect(zh.params).toEqual({
      tool: 'create_todo',
      ttlSeconds: 60,
      offlineTtlHours: 24,
    });
  });

  it('未知占位符保留原样（暴露缺参，而不是静默空白）', () => {
    const e = buildDenialExplanation('role_denied', { tool: 'x' }, 'en');
    expect(e.reason).toContain('{allowedRoles}');
  });
});

describe('denial-guidance › check-name mapping', () => {
  it.each([
    ['risk_policy', 'risk_r5'],
    ['tool_enabled', 'tool_disabled'],
    ['role_allowed', 'role_denied'],
    ['feature_flag', 'feature_disabled'],
    ['admin_only', 'admin_only'],
    ['destination_allowed', 'destination_denied'],
    ['field_domain', 'field_out_of_domain'],
    ['field_bound', 'field_out_of_bound'],
    ['approval_missing', 'approval_missing'],
    ['destination_binding', 'destination_changed'],
    ['agent_read_only', 'agent_read_only'],
  ])('AuthorizationCheck.name=%s → %s', (check, kind) => {
    expect(denialKindForCheck(check)).toBe(kind);
  });

  it('放行检查（user_scoped / risk_policy ok=true）不产生拒绝类别', () => {
    expect(denialKindForCheck('user_scoped')).toBeUndefined();
    expect(denialKindForCheck('unknown_check')).toBeUndefined();
  });
});

describe('denial-guidance › Accept-Language', () => {
  it('zh 前缀 → 中文；其余/缺失 → 英文；数组取第一个', () => {
    expect(pickLanguageFromHeader('zh-CN,zh;q=0.9')).toBe('zh');
    expect(pickLanguageFromHeader('en-US,en;q=0.9')).toBe('en');
    expect(pickLanguageFromHeader(undefined)).toBe('en');
    expect(pickLanguageFromHeader(['zh-TW', 'en'])).toBe('zh');
  });
});
