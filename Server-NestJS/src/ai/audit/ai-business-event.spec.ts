// SPDX-License-Identifier: Apache-2.0

import { deriveAiBusinessEvent } from './ai-business-event';

describe('deriveAiBusinessEvent（§internal.16 A-1 业务事件归一化）', () => {
  it('AI 工具名 → 业务事件名', () => {
    expect(deriveAiBusinessEvent('analyze_customer_risk')).toBe('CustomerRiskAssessed');
    expect(deriveAiBusinessEvent('analyze_project_risk')).toBe('ProjectRiskAssessed');
    expect(deriveAiBusinessEvent('create_followup_task')).toBe('FollowupTaskCreated');
    expect(deriveAiBusinessEvent('create_event')).toBe('EventCreated');
    expect(deriveAiBusinessEvent('create_todo')).toBe('TodoCreated');
    expect(deriveAiBusinessEvent('create_project_task')).toBe('ProjectTaskCreated');
    expect(deriveAiBusinessEvent('create_contract')).toBe('ContractCreated');
    expect(deriveAiBusinessEvent('submit_approval_request')).toBe('ApprovalSubmitted');
    expect(deriveAiBusinessEvent('review_approval_request')).toBe('ApprovalReviewed');
    expect(deriveAiBusinessEvent('update_customer_status')).toBe('CustomerStatusUpdated');
    // 2026-10-03：四个真写工具补上事件（此前一个都没有）
    expect(deriveAiBusinessEvent('create_followup_plan')).toBe('FollowupPlanCreated');
    expect(deriveAiBusinessEvent('create_project_with_tasks')).toBe('ProjectCreated');
    expect(deriveAiBusinessEvent('create_report')).toBe('ReportCreated');
    expect(deriveAiBusinessEvent('create_module_apply')).toBe('ModuleApplied');
    // 2026-10-07：四个生成模块的写工具随「追齐生成器」注册，事件一并补上
    expect(deriveAiBusinessEvent('create_book')).toBe('BookCreated');
    expect(deriveAiBusinessEvent('create_note')).toBe('NoteCreated');
    expect(deriveAiBusinessEvent('create_supplier')).toBe('SupplierCreated');
    expect(deriveAiBusinessEvent('create_tag')).toBe('TagCreated');
  });

  it('刻意不赋事件的写工具仍为 null（不是遗漏，见 tool-metadata.ts 的注释）', () => {
    // create_module 是 R1 dry-run（声明无副作用）⇒ 不是写动作；delete_customer 是 R5 恒阻断 ⇒ 永不执行。
    // 给它俩造事件 = 发明一条永不触发的记录。
    expect(deriveAiBusinessEvent('create_module')).toBeNull();
    expect(deriveAiBusinessEvent('delete_customer')).toBeNull();
  });

  it('未知工具 + resultType 兜底', () => {
    expect(deriveAiBusinessEvent('some_tool', 'crm_task')).toBe('FollowupTaskCreated');
    expect(deriveAiBusinessEvent('some_tool', 'app_request')).toBe('ApprovalSubmitted');
    expect(deriveAiBusinessEvent('some_tool', 'event')).toBe('EventCreated');
  });

  it('未知工具无 resultType → null（不硬造业务事件）', () => {
    expect(deriveAiBusinessEvent('query_customers')).toBeNull();
    expect(deriveAiBusinessEvent()).toBeNull();
    expect(deriveAiBusinessEvent('query_customers', 'unknown_type')).toBeNull();
  });
});
