// SPDX-License-Identifier: Apache-2.0

/**
 * 管理台可导航页面映射 — System AI Assistant 的 navigate_admin_page 工具使用。
 *
 * ─── 新增管理台页面时，必须三处同步更新（单一事实源） ───
 * ① 本文件 ADMIN_PAGE_ROUTES（添加 key + route + description）
 * ② Web-Admin-Vue/src/router/routes.ts 的 consoleChildren（添加对应路由）
 * ③ ADMIN_SYSTEM_PROMPT（由本映射模板生成页面清单，通常无需手改）
 */

export const ADMIN_PAGE_ROUTES: Record<
  string,
  { route: string; description: string }
> = {
  dashboard: { route: '/', description: '首页/概览' },
  users: { route: '/users', description: '用户管理' },
  events: { route: '/events', description: '事件管理' },
  knowledge: { route: '/knowledge', description: '知识库' },
  notifications: { route: '/notifications', description: '通知广播' },
  monitor: { route: '/monitor', description: '监控中心' },
  ops: { route: '/ops', description: '运维摘要' },
  'ai-audit': { route: '/audit', description: 'AI 审计' },
  'op-audit': { route: '/op-audit', description: '操作审计' },
  sessions: { route: '/sessions', description: '会话管理' },
  observability: { route: '/observability', description: '可观测性' },
  system: { route: '/system', description: '系统信息' },
  trash: { route: '/trash', description: '回收站' },
  'data-import': { route: '/data-import', description: '数据导入' },
  contracts: { route: '/contracts', description: '合同管理' },
  suppliers: { route: '/suppliers', description: '供应商管理' },
  tags: { route: '/tags', description: '标签管理' },
  notes: { route: '/notes', description: '笔记管理' },
  templates: { route: '/templates', description: '模板市场' },
  'ai-eval': { route: '/ai-eval', description: 'AI 评测' },
  'ai-timeline': { route: '/ai-timeline', description: 'AI 执行轨迹' },
  'ai-tools': { route: '/ai-tools', description: 'AI 工具与副作用' },
  'security-review': { route: '/security-review', description: '安全审查' },
  'security-showcase': { route: '/security-showcase', description: '安全演示（对抗性证明）' },
  'ai-approvals': { route: '/ai-approvals', description: 'AI 审批' },
  'agent-registry': { route: '/agent-registry', description: 'Agent 注册表' },
  'guard-overview': { route: '/guard-overview', description: '治理总览（KeelBase Guard）' },
  'policy-center': { route: '/policy-center', description: '策略中心（治理策略）' },
  risk: { route: '/risk', description: '风险中心（工具风险分布）' },
  mcp: { route: '/mcp', description: 'MCP 服务' },
  analytics: { route: '/analytics', description: '平台统计' },
  org: { route: '/org', description: '组织管理' },
  assistant: { route: '/system-ai-assistant', description: '系统 AI 助手（当前页）' },
};
