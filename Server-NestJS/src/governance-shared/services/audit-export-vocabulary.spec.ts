// SPDX-License-Identifier: Apache-2.0

import {
  ANSWER_HEADERS,
  objectTypeOptions,
  productActionLabel,
  productAuthorizationLabel,
  productInitiatorLabel,
  productObjectCell,
  productObjectLabel,
  productResultCell,
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

  it('a decision or undo row says what happened, not which tool it was about', () => {
    // The row carries `tool` for filtering; the Action cell answers "what happened". A release is
    // not a `create_event`, and an undo is not the thing it undid.
    // 行带 `tool` 是为筛选；动作列回答的是「发生了什么」。释放不是一次 `create_event`，撤销也不是
    // 它所撤销的那件事。
    expect(productActionLabel('create_event', 'claim_release')).toBe('Write-hold release');
    expect(productActionLabel('create_event', 'effect_revoke')).toBe('Undo of an AI write');
    expect(productActionLabel('create_event', 'audit_review')).toBe('Audit review receipt');
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

  it('the Result cell carries a release reading’s kind in product words (R-10)', () => {
    const currentState = productResultCell('result_unknown', {
      latest: 'current_state',
      askUnrecorded: false,
    });
    const receipt = productResultCell('result_unknown', {
      latest: 'receipt',
      askUnrecorded: false,
    });
    // The two readings differ inside the export itself, and neither leaks the stored token.
    // 两种读数在导出内部即不同，且都没有漏出存储用的令牌。
    expect(currentState).not.toBe(receipt);
    expect(currentState).toContain('current-state reading');
    expect(receipt).toContain('receipt reading');
    expect(
      productResultCell('result_unknown', { latest: 'unknown', askUnrecorded: false }),
    ).toContain('kind was not recorded');
    expect(productResultCell('executed', null)).toBe('Executed');
    expect(
      scanForInternalNames([currentState, receipt, productResultCell('executed', null)]),
    ).toEqual([]);
  });

  it('authorization: names the second person when known, and never invents a name', () => {
    expect(
      productAuthorizationLabel({
        confirmation: { status: 'approved', approverId: '7', approverName: 'audit_admin' },
        operatorName: 'alice',
        denied: false,
        allowed: true,
      }),
    ).toBe('Approved by audit_admin');

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

    // A second person who declined is named the same way, and an unresolvable name keeps saying a
    // second person decided — never «the operator».
    // 第二人拒绝同样点名；姓名解析不出来时仍说是第二个人做的决定 —— 不退回「本人」。
    expect(
      productAuthorizationLabel({
        confirmation: { status: 'declined', approverId: '7', approverName: 'audit_admin' },
        operatorName: 'alice',
        denied: true,
        allowed: false,
      }),
    ).toBe('Declined by audit_admin');

    expect(
      productAuthorizationLabel({
        confirmation: { status: 'declined', approverId: '7' },
        operatorName: 'alice',
        denied: true,
        allowed: false,
      }),
    ).toBe('Declined by a second person');

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
    // A system principal has no name and never will; the kind is known even when the person is not.
    // 系统主体没有名字、也不会有；人不知道，但主体的种类是知道的。
    expect(
      productInitiatorLabel({ username: null, userId: 'system:sweep', action: 'claim_release' }),
    ).toBe('Automated');
    expect(productInitiatorLabel({ username: null, userId: '7', action: 'claim_release' })).toBe(
      'Not recorded',
    );
  });

  it('the picker and the CSV name the same object the same way', () => {
    const options = objectTypeOptions();
    expect(options).toContainEqual({ value: 'crm_customer', label: 'Customer' });
    // Every picker label is a product word, not a token.
    expect(scanForInternalNames(options.map((o) => o.label))).toEqual([]);
  });
});
