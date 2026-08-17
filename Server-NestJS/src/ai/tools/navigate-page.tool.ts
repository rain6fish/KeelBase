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
 */
const PAGE_ROUTES: Record<string, { route: string; description: string }> = {
  home: { route: '/', description: '首页/仪表盘' },
  dashboard: { route: '/', description: '首页/仪表盘' },
  events: { route: '/events', description: '事件列表' },
  explore: { route: '/explore', description: '发现页' },
  ai: { route: '/ai', description: 'AI 助手' },
  profile: { route: '/profile', description: '个人资料' },
  settings: { route: '/settings', description: '设置' },
  todos: { route: '/todos', description: '待办清单' },
  flows: { route: '/flows/tasks', description: '审批待办' },
  tags: { route: '/tags', description: '标签' },
  notes: { route: '/notes', description: '笔记' },
  books: { route: '/books', description: '图书' },
  posts: { route: '/posts', description: '帖子' },
  myOrg: { route: '/my-org', description: '我的组织/组织通讯录' },
  points: { route: '/points', description: '积分签到/排行榜/成就' },
  crm: { route: '/crm', description: '客户管理（AI CRM）' },

  upload: { route: '/upload', description: '文件上传' },
  privacy: { route: '/privacy', description: '隐私政策' },
  terms: { route: '/terms', description: '服务条款' },
};

export class NavigatePageTool implements AiTool {
  readonly name = 'navigate_page';
  readonly description = `【重要】必须使用此工具来执行所有页面跳转请求。当用户说"打开XX"、"去XX"、"跳转到XX"、"帮我到XX"等导航类请求时，你必须调用此工具来实现实际跳转，绝对不要只是文字回复说"已跳转"。调用此工具后系统会自动执行页面跳转，你只需要根据跳转结果给出确认提示即可。

  支持页面：首页、事件列表、发现页、AI助手、个人资料、设置、待办清单、文件上传、积分签到。`;
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
