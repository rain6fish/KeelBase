// SPDX-License-Identifier: Apache-2.0

import { WebSearchTool } from './web-search.tool';

function makeConfig(key = '') {
  return { get: jest.fn((k: string, d?: unknown) => (k === 'TAVILY_API_KEY' ? key : d)) } as any;
}

describe('WebSearchTool（AI-14）', () => {
  it('未配置 API Key 时 enabled=false，执行返回降级提示', async () => {
    const tool = new WebSearchTool(makeConfig(''));
    expect(tool.enabled).toBe(false);

    const result = await tool.execute({ query: '天气' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('未配置');
  });

  it('空 query 报错', async () => {
    const tool = new WebSearchTool(makeConfig('key'));
    const result = await tool.execute({ query: '  ' });
    expect(result.success).toBe(false);
  });

  it('配置 Key 时 enabled=true 并调用 Tavily', async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { title: 'T', url: 'https://x.com', content: 'snippet' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    (global as any).fetch = mockFetch;
    const tool = new WebSearchTool(makeConfig('tavily-key'));

    const result = await tool.execute({ query: '北京马拉松', limit: 3 });

    expect(tool.enabled).toBe(true);
    expect(result.success).toBe(true);
    expect((result.data as any).results[0].title).toBe('T');
    // 校验请求体
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.tavily.com/search');
    expect(JSON.parse(init.body).query).toBe('北京马拉松');
    expect(init.headers.Authorization).toBe('Bearer tavily-key');
    delete (global as any).fetch;
  });

  it('Tavily 返回错误时返回失败', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue(
      new Response('nope', { status: 500 }),
    );
    const tool = new WebSearchTool(makeConfig('key'));
    const result = await tool.execute({ query: 'x' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
    delete (global as any).fetch;
  });

  it('toToolDefinition 含 query 必填', () => {
    const tool = new WebSearchTool(makeConfig(''));
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('web_search');
    expect(def.function.parameters.required).toContain('query');
  });
});
