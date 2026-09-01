// SPDX-License-Identifier: Apache-2.0

import { FlowDefinition } from './flow-definition.types';

/**
 * 内建流程定义（FLOW-6 首个审批场景）。
 * leave_approval：请假审批——天数 >3 走经理审批，否则直属审批。
 * 审批人 v1 用 data.approverId（发起时指定）；human_task 无 next → 审批通过即完成。
 */
export const DEFAULT_FLOW_DEFINITIONS: FlowDefinition[] = [
  {
    id: 'leave_approval',
    name: '请假审批',
    version: '1.0',
    trigger: 'form_submit:/api/leave',
    nodes: [
      {
        id: 'check_days',
        type: 'condition',
        name: '是否超3天',
        expr: '{{days}} > 3',
        then: 'manager_approve',
        else: 'direct_approve',
      },
      { id: 'manager_approve', type: 'human_task', name: '经理审批（>3 天）' },
      { id: 'direct_approve', type: 'human_task', name: '直属审批（≤3 天）' },
    ],
    security: { audit: true, confirmationRequired: true },
  },
  {
    id: 'org_request_approval',
    name: '组织内申请审批',
    version: '1.0',
    trigger: 'form_submit:/api/org/requests',
    nodes: [
      {
        id: 'check_dept',
        type: 'condition',
        name: '是否有部门',
        expr: '{{hasDepartment}} == true',
        then: 'dept_approve',
        else: 'org_approve',
      },
      {
        id: 'dept_approve',
        type: 'human_task',
        name: '部门管理员审批',
        assigneeOrgRole: { scope: 'department', role: 'admin' },
        next: 'org_approve',
      },
      {
        id: 'org_approve',
        type: 'human_task',
        name: '组织管理员审批',
        assigneeOrgRole: { scope: 'org', role: 'admin' },
      },
    ],
    security: { audit: true, confirmationRequired: true },
  },
];
