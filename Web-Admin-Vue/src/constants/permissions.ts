// SPDX-License-Identifier: Apache-2.0

/**
 * 管理台权限点（WEB-FRONT-2 渲染层）。
 *
 * 定位：仅渲染层（路由/按钮显隐），授权唯一来源仍是后端 CASL（隐藏 ≠ 越权）。
 * 权限点 → 后端资源要求映射：admin（resources 含 all/all）自动拥有全部；
 * 普通用户按 resources 中对应 subject 的 scope 判定。动态 RBAC 为 v1.1 触发（私有 roadmap），
 * 当前双角色阶段本清单即覆盖管理台功能。
 */
export const PERMISSIONS = {
  USER_MANAGE: 'user.manage',
  EVENT_MANAGE: 'event.manage',
  AUDIT_VIEW: 'audit.view',
  OP_AUDIT_VIEW: 'op-audit.view',
  SESSION_MANAGE: 'session.manage',
  SETTINGS_MANAGE: 'settings.manage',
  BROADCAST_SEND: 'broadcast.send',
  DATA_IMPORT: 'data.import',
  TRASH_RESTORE: 'trash.restore',
  KNOWLEDGE_MANAGE: 'knowledge.manage',
  MONITOR_VIEW: 'monitor.view',
  ANALYTICS_VIEW: 'analytics.view',
  ORG_MANAGE: 'org.manage',
  FORM_MANAGE: 'form.manage',
  PLUGIN_MANAGE: 'plugin.manage',
  EVAL_RUN: 'eval.run',
  TOOL_EFFECTS_MANAGE: 'tool-effects.manage',
  APPROVAL_MANAGE: 'approval.manage',
  PERMISSION_VIEW: 'permission.view',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** 权限点 → 后端资源要求（subject + scope）。未列出的资源按 all/all 兜底。 */
export const PERMISSION_MAP: Record<string, { subject: string; scope: 'all' | 'own' }> = {
  [PERMISSIONS.USER_MANAGE]: { subject: 'User', scope: 'all' },
  [PERMISSIONS.EVENT_MANAGE]: { subject: 'Event', scope: 'all' },
  [PERMISSIONS.AUDIT_VIEW]: { subject: 'AiAuditLog', scope: 'all' },
  [PERMISSIONS.OP_AUDIT_VIEW]: { subject: 'OperationAudit', scope: 'all' },
  [PERMISSIONS.SESSION_MANAGE]: { subject: 'Session', scope: 'all' },
  [PERMISSIONS.SETTINGS_MANAGE]: { subject: 'Settings', scope: 'all' },
  [PERMISSIONS.BROADCAST_SEND]: { subject: 'Notification', scope: 'all' },
  [PERMISSIONS.DATA_IMPORT]: { subject: 'DataImport', scope: 'all' },
  [PERMISSIONS.TRASH_RESTORE]: { subject: 'Event', scope: 'all' },
  [PERMISSIONS.KNOWLEDGE_MANAGE]: { subject: 'KnowledgeArticle', scope: 'all' },
  [PERMISSIONS.MONITOR_VIEW]: { subject: 'Monitor', scope: 'all' },
  [PERMISSIONS.ANALYTICS_VIEW]: { subject: 'Analytics', scope: 'all' },
  [PERMISSIONS.ORG_MANAGE]: { subject: 'Organization', scope: 'all' },
  [PERMISSIONS.FORM_MANAGE]: { subject: 'FormSchema', scope: 'all' },
  [PERMISSIONS.PLUGIN_MANAGE]: { subject: 'Plugin', scope: 'all' },
  [PERMISSIONS.EVAL_RUN]: { subject: 'EvalCase', scope: 'all' },
  [PERMISSIONS.TOOL_EFFECTS_MANAGE]: { subject: 'AiToolEffect', scope: 'all' },
  [PERMISSIONS.APPROVAL_MANAGE]: { subject: 'ApprovalRequest', scope: 'all' },
  [PERMISSIONS.PERMISSION_VIEW]: { subject: 'Permission', scope: 'all' },
}
