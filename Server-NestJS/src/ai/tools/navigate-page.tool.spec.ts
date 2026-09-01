// SPDX-License-Identifier: Apache-2.0

import { NavigatePageTool } from './navigate-page.tool';

describe('NavigatePageTool', () => {
  const tool = new NavigatePageTool();

  it('定义名称与参数枚举', () => {
    expect(tool.name).toBe('navigate_page');
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('navigate_page');
    expect(def.function.parameters.properties.page.enum).toContain('events');
    expect(def.function.parameters.required).toEqual(['page']);
  });

  it('已知页面返回跳转目标', async () => {
    const result = await tool.execute({ page: 'events' }, '42');
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ navigateTo: '/events', pageName: 'events', description: '事件列表' });
  });

  it('未知页面返回错误', async () => {
    const result = await tool.execute({ page: 'billing' }, '42');
    expect(result.success).toBe(false);
    expect(result.error).toContain('未知页面：billing');
  });
});
