// SPDX-License-Identifier: Apache-2.0

/**
 * 操作审计「功能实际名称」映射。
 *
 * 后端按 method + path 生成语义 key（如 `users.create`、`auth.login`），
 * 前端按当前语言渲染为可读功能名（「用户管理 · 创建用户」/ "Users · Create"）。
 * 原则 3：审计中要能看到用户操作的是哪个功能的实际名称。
 */

export interface FeatureAction {
  /** 语义 key，形如 users.create —— 前端 i18n 用 */
  key: string;
  /** 兜底英文描述（前端无 i18n 条目时显示） */
  fallback: string;
}

const API_PREFIX = '/api/v1';

/** 精确匹配的端点（method + path → key/fallback） */
const EXACT: Array<{ method: string; path: string; key: string; fallback: string }> = [
  { method: 'POST', path: '/auth/login', key: 'auth.login', fallback: 'Auth · Login' },
  { method: 'POST', path: '/auth/register', key: 'auth.register', fallback: 'Auth · Register' },
  { method: 'POST', path: '/auth/logout', key: 'auth.logout', fallback: 'Auth · Logout' },
  { method: 'POST', path: '/auth/refresh', key: 'auth.refresh', fallback: 'Auth · Refresh token' },
  { method: 'POST', path: '/auth/oauth', key: 'auth.oauth', fallback: 'Auth · OAuth login' },
  { method: 'POST', path: '/auth/forgot-password', key: 'auth.forgotPassword', fallback: 'Auth · Forgot password' },
  { method: 'POST', path: '/auth/reset-password', key: 'auth.resetPassword', fallback: 'Auth · Reset password' },
  { method: 'POST', path: '/auth/verify-email', key: 'auth.verifyEmail', fallback: 'Auth · Verify email' },
  { method: 'POST', path: '/auth/resend-verification', key: 'auth.resendVerification', fallback: 'Auth · Resend verification' },
  { method: 'POST', path: '/auth/sessions', key: 'auth.manageSessions', fallback: 'Auth · Manage sessions' },
  { method: 'DELETE', path: '/auth/sessions', key: 'auth.manageSessions', fallback: 'Auth · Manage sessions' },
  { method: 'POST', path: '/upload', key: 'upload.upload', fallback: 'Upload · File upload' },
  { method: 'POST', path: '/admin/notifications/broadcast', key: 'admin.broadcast', fallback: 'Admin · Broadcast notification' },
  { method: 'DELETE', path: '/admin/sessions', key: 'admin.revokeSession', fallback: 'Admin · Revoke session' },
  { method: 'POST', path: '/push/tokens', key: 'push.registerToken', fallback: 'Push · Register device token' },
  { method: 'DELETE', path: '/push/tokens', key: 'push.unregisterToken', fallback: 'Push · Unregister device token' },
  { method: 'POST', path: '/ai/chat', key: 'ai.chat', fallback: 'AI · Chat' },
  { method: 'POST', path: '/ai/chat/stream', key: 'ai.chat', fallback: 'AI · Chat (stream)' },
  { method: 'POST', path: '/ai/insights', key: 'ai.insights', fallback: 'AI · Insights' },
  { method: 'POST', path: '/ai/knowledge', key: 'ai.createKnowledge', fallback: 'AI · Create knowledge' },
  { method: 'PATCH', path: '/ai/knowledge', key: 'ai.updateKnowledge', fallback: 'AI · Update knowledge' },
  { method: 'DELETE', path: '/ai/knowledge', key: 'ai.deleteKnowledge', fallback: 'AI · Delete knowledge' },
  { method: 'DELETE', path: '/ai/conversations', key: 'ai.deleteConversation', fallback: 'AI · Delete conversation' },
  // 待办（A12：避免审计名退化为 todos.create/update/delete）
  { method: 'POST', path: '/todos', key: 'todos.create', fallback: 'Todos · Create' },
  { method: 'PATCH', path: '/todos', key: 'todos.update', fallback: 'Todos · Update' },
  { method: 'DELETE', path: '/todos', key: 'todos.delete', fallback: 'Todos · Delete' },
  // 积分/签到（A12）
  { method: 'POST', path: '/points/checkin', key: 'points.checkin', fallback: 'Points · Daily check-in' },
  { method: 'GET', path: '/points/me', key: 'points.myOverview', fallback: 'Points · My overview' },
  { method: 'GET', path: '/points/leaderboard', key: 'points.leaderboard', fallback: 'Points · Leaderboard' },
  { method: 'GET', path: '/points/achievements', key: 'points.achievements', fallback: 'Points · Achievements' },
];

const METHOD_ACTION: Record<string, string> = {
  POST: 'create',
  PATCH: 'update',
  PUT: 'update',
  DELETE: 'delete',
};

/** 从 method + 原始 URL（含 /api/v1 前缀与 query）推导功能语义 key */
export function deriveFeature(method: string, url: string): FeatureAction {
  const clean = (url || '').split('?')[0];
  const path = clean.startsWith(API_PREFIX) ? clean.slice(API_PREFIX.length) : clean;
  const m = method.toUpperCase();

  // 1) 精确匹配（先处理 admin/ai 等有子路径的端点）
  for (const e of EXACT) {
    if (e.method === m && (path === e.path || path.startsWith(`${e.path}/`))) {
      return { key: e.key, fallback: e.fallback };
    }
  }

  // approval 审批决策（带 :id——decide/review 是业务决策非资源创建，避免兜底成 approval.create）
  const decision = /^\/approval\/requests\/\d+\/(decide|review)$/.exec(path);
  if (decision) {
    return decision[1] === 'decide'
      ? { key: 'approval.decide', fallback: 'Approval · Decide' }
      : { key: 'approval.review', fallback: 'Approval · Review' };
  }

  // 2) 按模块取第一段
  const segs = path.split('/').filter(Boolean);
  const module = segs[0];
  if (!module) return { key: 'unknown.unknown', fallback: 'Unknown' };

  const action = METHOD_ACTION[m];
  if (!action) return { key: `unknown.${m.toLowerCase()}`, fallback: `${module} · ${m}` };
  return { key: `${module}.${action}`, fallback: `${module} · ${action}` };
}
