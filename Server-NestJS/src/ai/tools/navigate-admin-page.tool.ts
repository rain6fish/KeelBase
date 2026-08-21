/**
 * 管理台导航工具 — navigate_admin_page（System AI Assistant，L3 Navigate）
 *
 * 管理员通过系统 AI 助手跳转到管理控制台内指定页面。
 * 工具返回目标路由，Web-Admin-Vue 收到 navigateTo 后执行 router.push。
 * adminOnly：仅系统账号（'0'，管理端助手身份）可调用，普通用户 AI 会话被 _assertToolAllowed 拒绝。
 *
 * ─── 新增管理台页面时，请同步更新 ADMIN_PAGE_ROUTES（见 admin-pages.ts 头部 3 处同步规则） ───
 */

import { AiTool, ToolDefinition, ToolResult } from '../interfaces/tool.interface';
import { ToolParameter } from '../interfaces/tool.interface';
import { ADMIN_PAGE_ROUTES } from '../constants/admin-pages';

export class AdminNavigatePageTool implements AiTool {
  readonly name = 'navigate_admin_page';
  readonly description = `【管理台导航】当管理员要求打开/进入/跳到管理控制台某个页面时，必须调用此工具完成实际跳转，绝对不要只是文字回复说"已跳转"。调用后系统会自动执行跳转，你只需要确认即可。

  支持页面：${Object.keys(ADMIN_PAGE_ROUTES).join('、')}。`;
  readonly permissions = { adminOnly: true };

  readonly parameters: ToolParameter[] = [
    {
      name: 'page',
      type: 'string',
      description: `目标页面。可选值：${Object.keys(ADMIN_PAGE_ROUTES).join('、')}。如果用户说的页面不在列表中，选择最接近的。`,
      required: true,
      enum: Object.keys(ADMIN_PAGE_ROUTES),
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
              enum: Object.keys(ADMIN_PAGE_ROUTES),
              description: '目标管理台页面名称',
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
    const target = ADMIN_PAGE_ROUTES[pageName];

    if (!target) {
      return { success: false, error: `未知页面：${pageName}` };
    }

    return {
      success: true,
      data: {
        navigateTo: target.route,
        pageName,
        description: target.description,
      },
    };
  }
}
