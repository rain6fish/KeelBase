// SPDX-License-Identifier: Apache-2.0

/**
 * The server's Explainable Authz reasons are a fixed vocabulary, and the frozen
 * `permission-capability-list` wire shape carries no key field. The console therefore maps the known
 * strings to dictionary keys here; an unknown string is shown exactly as the server sent it.
 *
 * 服务端的 Explainable Authz 依据是一套固定词表，而冻结的 `permission-capability-list` wire 形状不带
 * key 字段。控制台在这里把已知字符串映射到词典 key；未知字符串按服务端原样显示。
 */
const AUTHZ_REASON_KEYS: Record<string, string> = {
  '管理员：可管理全部资源': 'permissionReasonAdmin',
  '管理员角色：可管理全部资源': 'permissionBasisAdmin',
  '只能操作自己的数据（行级所有权条件）': 'permissionReasonOwn',
  '可访问（无行级限制）': 'permissionReasonUnrestricted',
  '审计读者：只读审计与治理面': 'permissionBasisAuditor',
  '普通用户：可管理本人拥有的资源（行级所有权条件）': 'permissionBasisUser',
  '可操作（本人所有权范围，行级条件）': 'permissionExplainAllowedOwn',
  '当前策略不允许此操作': 'permissionExplainDeniedAdmin',
  '需要管理员权限，或该资源不在你的可管理范围': 'permissionExplainDeniedUser',
}

/** The dictionary key for a known server reason, or null when the console has no entry. */
export function authzReasonKey(text: string | null | undefined): string | null {
  return text ? AUTHZ_REASON_KEYS[text] ?? null : null
}
