// SPDX-License-Identifier: Apache-2.0

import { AdminNavigatePageTool } from './navigate-admin-page.tool';

describe('AdminNavigatePageTool（System AI Assistant L3）', () => {
  const tool = new AdminNavigatePageTool();

  it('定义名称、adminOnly 权限与参数枚举', () => {
    expect(tool.name).toBe('navigate_admin_page');
    expect(tool.permissions).toEqual({ adminOnly: true });
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('navigate_admin_page');
    expect(def.function.parameters.properties.page.enum).toContain('system');
    expect(def.function.parameters.required).toEqual(['page']);
  });

  it('已知页面返回管理台跳转目标', async () => {
    const result = await tool.execute({ page: 'system' }, '0');
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ navigateTo: '/system', pageName: 'system', description: '系统信息' });
  });

  it('未知页面返回错误', async () => {
    const result = await tool.execute({ page: 'billing' }, '0');
    expect(result.success).toBe(false);
    expect(result.error).toContain('未知页面：billing');
  });
});
