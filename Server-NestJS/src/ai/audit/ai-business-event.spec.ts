// SPDX-License-Identifier: Apache-2.0

import { deriveAiBusinessEvent } from './ai-business-event';

describe('deriveAiBusinessEvent（§22.16 A-1 业务事件归一化）', () => {
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
