// SPDX-License-Identifier: Apache-2.0

import {
  ANSWER_HEADERS,
  objectTypeOptions,
  productActionLabel,
  productAuthorizationLabel,
  productInitiatorLabel,
  productObjectCell,
  productObjectLabel,
  productResultLabel,
} from './audit-export-vocabulary';
import { EXPLANATION_STATES } from './audit-explanation-state';
import { scanForInternalNames } from '../../../test/answer-vocabulary-scan';

/**
 * U1's acceptance is a property of the **whole** export: six columns, and zero internal names in
 * the headers or the values. This spec pins the one module that can break it.
 *
 * U1 的验收是**整份导出**的性质：六列，且列头与取值里 0 处内部名。本 spec 钉住那个唯一能破坏它的
 * 模块。
 */
describe('audit export vocabulary', () => {
  it('six headers, in the minute’s order (时间 / 动作 / 结果 / 对象 / 授权 / 发起人)', () => {
    expect(ANSWER_HEADERS).toEqual([
      'Time (UTC)',
      'Action',
      'Result',
      'Object',
      'Authorization',
      'Initiated by',
    ]);
    expect(scanForInternalNames([...ANSWER_HEADERS])).toEqual([]);
  });

  it('a known object type gets its business noun; an unknown one never echoes itself', () => {
    expect(productObjectLabel('crm_customer')).toBe('Customer');
    expect(productObjectLabel('pm_project')).toBe('Project');
    expect(productObjectLabel('expense_claims')).toBe('Business record');
    expect(productObjectLabel(null)).toBe('Business record');
  });

  it('the Object cell keeps the business id but never the type token', () => {
    expect(productObjectCell({ resultType: 'crm_customer', resultId: 9005 })).toBe(
      'Customer #9005',
    );
    expect(productObjectCell({ resultType: 'expense_claims', resultId: 12 })).toBe(
      'Business record #12',
    );
    expect(productObjectCell(null)).toBe('Not recorded');
  });

  it('a known tool gets its business label; an unknown tool falls back to the action kind', () => {
    expect(productActionLabel('create_event', 'tool_call')).toBe('Create event');
    // The tool name is internal — it must never survive the fallback.
    // 工具名是内部的 —— 回落时绝不能把它带出去。
    expect(productActionLabel('some_new_tool', 'tool_call')).toBe('AI action');
    expect(productActionLabel(null, 'audit_review')).toBe('Audit review receipt');
    expect(productActionLabel(null, 'brand_new_action')).toBe('AI action');
  });

  it('every explanation state has a product word', () => {
    for (const state of EXPLANATION_STATES) {
      const word = productResultLabel(state);
      expect(word).toMatch(/^[A-Z][a-z]/);
      expect(scanForInternalNames([word])).toEqual([]);
    }
    expect(productResultLabel('executed')).toBe('Executed');
    expect(productResultLabel('not_executed')).toBe('Not executed');
  });

  it('authorization: names the second person when known, and never invents a name', () => {
    expect(
      productAuthorizationLabel({
        confirmation: { status: 'approved', approverId: '7', approverName: 'audit_admin' },
        operatorName: 'alice',
        denied: false,
        allowed: true,
      }),
    ).toBe('Second-person approval by audit_admin');

    // No name on the decision row ⇒ the gap is said, not filled.
    // 裁决行上没有姓名 ⇒ 说出缺口，不填空。
    expect(
      productAuthorizationLabel({
        confirmation: { status: 'approved', approverId: '7' },
        operatorName: 'alice',
        denied: false,
        allowed: true,
      }),
    ).toBe('Second-person approval (approver name not recorded)');

    expect(
      productAuthorizationLabel({
        confirmation: { status: 'approved', approverId: null },
        operatorName: 'alice',
        denied: false,
        allowed: true,
      }),
    ).toBe('Confirmed by alice');

    expect(
      productAuthorizationLabel({
        confirmation: { status: 'timeout' },
        denied: false,
        allowed: true,
      }),
    ).toBe('Window expired without a decision');

    expect(
      productAuthorizationLabel({ confirmation: null, denied: true, allowed: false }),
    ).toBe('Refused (no approval recorded)');
    expect(
      productAuthorizationLabel({ confirmation: null, denied: false, allowed: true }),
    ).toBe('Not required (trusted scope)');
    expect(
      productAuthorizationLabel({ confirmation: null, denied: false, allowed: false }),
    ).toBe('Not recorded');
  });

  it('initiator: the AI-or-human distinction the published page could not make', () => {
    expect(productInitiatorLabel({ username: 'alice', action: 'tool_call' })).toBe(
      'alice (through the AI assistant)',
    );
    expect(productInitiatorLabel({ username: 'alice', action: 'audit_review' })).toBe(
      'alice (directly)',
    );
    expect(
      productInitiatorLabel({ username: 'alice', action: 'tool_call', agentId: 'headless:abc' }),
    ).toBe('alice (through the AI assistant, delegated)');
    expect(productInitiatorLabel({ username: null, action: 'tool_call' })).toBe('Not recorded');
  });

  it('the picker and the CSV name the same object the same way', () => {
    const options = objectTypeOptions();
    expect(options).toContainEqual({ value: 'crm_customer', label: 'Customer' });
    // Every picker label is a product word, not a token.
    expect(scanForInternalNames(options.map((o) => o.label))).toEqual([]);
  });
});
