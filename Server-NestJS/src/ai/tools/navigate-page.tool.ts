// SPDX-License-Identifier: Apache-2.0

/**
 * 页面导航工具 — navigate_page
 *
 * 用户通过 AI 对话跳转到 App 内指定页面。
 * 工具返回目标路由，Flutter 端收到 navigateTo 后执行跳转。
 *
 * ─── 新增功能页面时，请在此文件的两个位置同步更新 ───
 * ① 下面的 PAGE_ROUTES 映射表（添加 key + route + description）
 * ② description 字符串末尾补充说明
 * ③ enum 数组中添加新 key
 */

import { AiTool, ToolDefinition, ToolResult } from '../interfaces/tool.interface';
import { ToolParameter } from '../interfaces/tool.interface';

/**
 * 可导航页面映射表
 *
 * 新增功能页时在此添加：
 *   newFeature: { route: '/route-path', description: '中文描述' }
 *
 * 首页路由的**唯一真源**：`AiService.detectNavigation` 的关键词命中后由此表取 route/description，
 * 不再自持一份硬编码路由副本（两份表曾各自漂移，且高频路径走的正是没被对账的那份）。
 */
export const PAGE_ROUTES: Record<string, { route: string; description: string }> = {
  home: { route: '/', description: '首页/仪表盘' },
  dashboard: { route: '/', description: '首页/仪表盘' },
  events: { route: '/events', description: '事件列表' },
  notifications: { route: '/notifications', description: '通知' },
  search: { route: '/search', description: '全局搜索' },
  explore: { route: '/explore', description: '发现页' },
  ai: { route: '/ai', description: 'AI 助手' },
  profile: { route: '/profile', description: '个人资料' },
  settings: { route: '/settings', description: '设置' },
  todos: { route: '/todos', description: '待办清单' },
  asset_loans: { route: '/asset_loans', description: '资产借用' },
  points_ledgers: { route: '/points_ledgers', description: '积分台账' },
  point_records: { route: '/point_records', description: '积分流水' },
  reports: { route: '/reports', description: '报告' },
  followup_plans: { route: '/followup_plans', description: '跟进计划' },
  contracts: { route: '/contracts', description: '合同' },
  suppliers: { route: '/suppliers', description: '供应商' },
  flows: { route: '/flows/tasks', description: '审批待办' },
  tags: { route: '/tags', description: '标签' },
  notes: { route: '/notes', description: '笔记' },
  books: { route: '/books', description: '图书' },
  posts: { route: '/posts', description: '帖子' },
  myOrg: { route: '/my-org', description: '我的组织/组织通讯录' },
  points: { route: '/points', description: '积分签到/排行榜/成就' },
  crm: { route: '/crm', description: '客户管理（AI CRM）' },
  pm: { route: '/pm', description: '项目管理（AI Project）' },
  approval: { route: '/approval', description: '审批中心（AI Approval）' },

  upload: { route: '/upload', description: '文件上传' },
  privacy: { route: '/privacy', description: '隐私政策' },
  terms: { route: '/terms', description: '服务条款' },
};

/** 支持页面清单由 PAGE_ROUTES 派生（单一真源，防陈旧硬编码文案漂移） */
const SUPPORTED_PAGES = [...new Set(Object.values(PAGE_ROUTES).map((p) => p.description))].join('、');

/**
 * 确定性导航的「词 → 页面键」表：`AiService` 在调 LLM **之前**用它识别导航意图，键须存在于 `PAGE_ROUTES`。
 *
 * 与 `PAGE_ROUTES` 同放一处，是为了让两张表**不可能各自漂移** —— 此前关键词表另持一份硬编码 route 副本，
 * 而高频路径走的正是那份没被对账的表。键的闭包由守卫测试 `ai-service.navigation.spec.ts` 校验。
 */
export const NAV_KEYWORDS: Array<{ keywords: string[]; page: string }> = [
  { keywords: ['首页', '主页', 'home', 'dashboard'], page: 'home' },
  { keywords: ['事件', '日程', '日历', 'events'], page: 'events' },
  { keywords: ['发现', 'explore'], page: 'explore' },
  { keywords: ['个人资料', '资料', 'profile'], page: 'profile' },
  { keywords: ['设置', '系统设置', 'settings'], page: 'settings' },
  { keywords: ['上传', 'upload', '文件上传'], page: 'upload' },
  { keywords: ['ai', 'AI', '助手'], page: 'ai' },
];

export class NavigatePageTool implements AiTool {
  readonly name = 'navigate_page';
  readonly description = `【重要】必须使用此工具来执行所有页面跳转请求。当用户说"打开XX"、"去XX"、"跳转到XX"、"帮我到XX"等导航类请求时，你必须调用此工具来实现实际跳转，绝对不要只是文字回复说"已跳转"。调用此工具后系统会自动执行页面跳转，你只需要根据跳转结果给出确认提示即可。

  支持页面：${SUPPORTED_PAGES}。`;
  readonly parameters: ToolParameter[] = [
    {
      name: 'page',
      type: 'string',
      description: `目标页面。可选值：${Object.keys(PAGE_ROUTES).join('、')}。如果用户说的页面不在列表中，选择最接近的。`,
      required: true,
      enum: Object.keys(PAGE_ROUTES),
    },
  ];

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            page: {
              type: 'string',
              enum: Object.keys(PAGE_ROUTES),
              description: '目标页面名称',
            },
          },
          required: ['page'],
        },
      },
    };
  }

  async execute(
    args: Record<string, unknown>,
    _userId: string,
  ): Promise<ToolResult> {
    const pageName = args.page as string;
    const target = PAGE_ROUTES[pageName];

    if (!target) {
      return {
        success: false,
        error: `未知页面：${pageName}`,
      };
    }

    return {
      success: true,
      data: {
        navigateTo: target.route,
        pageName: pageName,
        description: target.description,
      },
    };
  }
}
