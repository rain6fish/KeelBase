import { ProxyTool } from './proxy-tool';

/** mock 委托服务：签发固定 token */
const mockDelegation = {
  sign: jest.fn(async (userId: string, audience: string) => ({
    token: `jwt-${userId}-${audience}`,
    subject: 'sub',
    expiresIn: 300,
    userId,
    audience,
  })),
};

describe('ProxyTool（AI Bridge B 路径）', () => {
  const base = 'http://localhost:4000/api';
  const audience = 'legacy-erp';

  it('读工具：R1 自动（不确认）+ URL 路径模板替换 + 委托头注入', async () => {
    const tool = new ProxyTool(
      {
        name: 'proxy_get_contract',
        description: '查合同',
        method: 'GET',
        path: '/contracts/{id}',
        parameters: [{ name: 'id', type: 'string', description: '合同 id', required: true }],
        riskLevel: 'R1',
      },
      mockDelegation as any,
      base,
      audience,
    );
    expect(tool.requiresConfirmation).toBe(false);
    expect(tool.riskLevel).toBe('R1');

    // mock fetch 捕获请求
    const origFetch = global.fetch;
    let captured: { url: string; headers: any } | null = null;
    global.fetch = (async (url: string, init: any) => {
      captured = { url, headers: init.headers };
      return { ok: true, status: 200, json: async () => ({ title: '合同A' }), text: async () => '' } as any;
    }) as any;

    const result = await tool.execute({ id: '42' }, 'u1');
    global.fetch = origFetch;

    expect(result.success).toBe(true);
    expect(captured!.url).toBe('http://localhost:4000/api/contracts/42');
    expect(captured!.headers.Authorization).toBe('Bearer jwt-u1-legacy-erp');
    expect(mockDelegation.sign).toHaveBeenCalledWith('u1', 'legacy-erp');
  });

  it('写工具：缺省 R3（需确认）+ body 发送', async () => {
    const tool = new ProxyTool(
      {
        name: 'proxy_create_contract',
        description: '建合同',
        method: 'POST',
        path: '/contracts',
        parameters: [{ name: 'title', type: 'string', description: '标题', required: true }],
      },
      mockDelegation as any,
      base,
      audience,
    );
    expect(tool.requiresConfirmation).toBe(true);
    expect(tool.riskLevel).toBe('R3');

    let body: string | null = null;
    const origFetch = global.fetch;
    global.fetch = (async (url: string, init: any) => {
      body = init.body;
      return { ok: true, status: 201, json: async () => ({ id: 1 }), text: async () => '' } as any;
    }) as any;

    const result = await tool.execute({ title: '新合同' }, 'u1');
    global.fetch = origFetch;

    expect(result.success).toBe(true);
    expect(JSON.parse(body!)).toEqual({ title: '新合同' });
  });

  it('缺路径参数 → 失败（不调目标）', async () => {
    const tool = new ProxyTool(
      {
        name: 'proxy_get_contract',
        description: '查合同',
        method: 'GET',
        path: '/contracts/{id}',
        parameters: [{ name: 'id', type: 'string', description: 'id', required: true }],
      },
      mockDelegation as any,
      base,
      audience,
    );
    const r = await tool.execute({}, 'u1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/缺少路径参数/);
  });

  it('目标 4xx → 透传错误（供 Agent 回退）', async () => {
    const tool = new ProxyTool(
      {
        name: 'proxy_list',
        description: '列',
        method: 'GET',
        path: '/contracts',
        parameters: [],
      },
      mockDelegation as any,
      base,
      audience,
    );
    const origFetch = global.fetch;
    global.fetch = (async () => ({ ok: false, status: 401, text: async () => 'unauthorized' }) as any) as any;
    const r = await tool.execute({}, 'u1');
    global.fetch = origFetch;
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/401/);
  });
});
