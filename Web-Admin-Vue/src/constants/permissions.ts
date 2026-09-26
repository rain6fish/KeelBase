// SPDX-License-Identifier: Apache-2.0

/**
 * 管理台权限点（WEB-FRONT-2 渲染层）。
 *
 * 定位：渲染层（路由 / 菜单 / 按钮显隐）声明用的词汇；**授权唯一来源仍是后端**——
 * `GET /auth/me/permissions` 返回的能力清单（隐藏 ≠ 越权，服务端仍逐请求裁决）。
 *
 * 约束：能进 `PERMISSION_MAP` 的点，其 subject 必须是后端 CASL **真实产出**的
 * （`Server-NestJS/src/common/casl/casl-ability.factory.ts` createForUser）。
 * 没有对应后端 subject 的能力不要造点——该路由 / 按钮留空 `meta.permission`，回退角色门。
 */
export const PERMISSIONS = {
  USER_MANAGE: 'user.manage',
  EVENT_MANAGE: 'event.manage',
  APPROVAL_MANAGE: 'approval.manage',
  CRM_VIEW: 'crm.view',
  PM_VIEW: 'pm.view',
  TODO_MANAGE: 'todo.manage',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/**
 * 权限点 → 后端资源要求（subject + scope）。
 *
 * **只列后端 CASL 真实产出的 subject**；命中能力清单里的 `{subject, scope}`（或 admin 的 all/all）即放行。
 *
 * 2026-09-15 修正：原表有 ~15 条指向后端从不产出的 subject
 * （AiAuditLog / OperationAudit / Session / Settings / Notification / DataImport /
 *  KnowledgeArticle / Monitor / Analytics / Organization / FormSchema / Plugin /
 *  EvalCase / AiToolEffect / Permission）——那是恒 false 的**虚构映射**，已删除。
 * 被删的点若将来要用，须先在后端 createForUser 落出对应 subject（属授权面变更，走 Protocol 先行）。
 */
export const PERMISSION_MAP: Record<string, { subject: string; scope: 'all' | 'own' }> = {
  [PERMISSIONS.USER_MANAGE]: { subject: 'User', scope: 'all' },
  [PERMISSIONS.EVENT_MANAGE]: { subject: 'Event', scope: 'all' },
  [PERMISSIONS.APPROVAL_MANAGE]: { subject: 'ApprovalRequest', scope: 'own' },
  [PERMISSIONS.CRM_VIEW]: { subject: 'CrmCustomer', scope: 'own' },
  [PERMISSIONS.PM_VIEW]: { subject: 'PmProject', scope: 'own' },
  [PERMISSIONS.TODO_MANAGE]: { subject: 'Todo', scope: 'own' },
}
