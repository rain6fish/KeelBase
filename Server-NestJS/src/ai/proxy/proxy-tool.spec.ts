// SPDX-License-Identifier: Apache-2.0

import { ProxyTool } from './proxy-tool';
import { outboundIdempotencyKey } from './outbound-idempotency';

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

  it('path 含 // 前缀或绝对 URL → 拒绝（SSRF 防护）', async () => {
    for (const badPath of ['//evil.com/contracts', 'http://evil.com/contracts', 'https://evil.com/contracts']) {
      const tool = new ProxyTool(
        { name: 't', description: 'd', method: 'GET', path: badPath, parameters: [] },
        mockDelegation as any,
        base,
        audience,
      );
      const r = await tool.execute({}, 'u1');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/非法目标路径/);
    }
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

  it('外部调用超时（KB-4 FP-3）→ 返回带"超时"失败，不无限挂起', async () => {
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
      30, // 短超时注入，避免真实 30s
    );
    const origFetch = global.fetch;
    // 永不返回但尊重 AbortSignal：abort → reject AbortError（模拟真实 fetch 挂起被中止）
    global.fetch = ((_url: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      })) as unknown as typeof fetch;
    try {
      const r = await tool.execute({ id: '42' }, 'u1');
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/超时/);
    } finally {
      global.fetch = origFetch;
    }
  });
});

/**
 * ACT-9b：出站**写**携带 `Idempotency-Key`（docs/ai-agent.spec.md §6.6）。
 *
 * 键由**一次工具执行的作用域**带下来（`executeWrite` 放进 `outboundIdempotencyKey`）—— 值就是本地账本
 * 与执行占位用的同一个键，故一次逻辑调用在两侧是同一个键。两个反向对照钉住两条边界：读请求不带（幂等键
 * 是写语义），作用域缺席不带（没走过认领路径就没有键，编一个等于发出一个没人认同的键）。
 */
describe('ACT-9b 出站写的幂等键（Idempotency-Key）', () => {
  const base = 'http://localhost:4000/api';
  const audience = 'legacy-erp';

  const proxyTool = (method: string, path: string, riskLevel: string) =>
    new ProxyTool(
      {
        name: `proxy_${method.toLowerCase()}_thing`,
        description: 'x',
        method,
        path,
        parameters: [{ name: 'title', type: 'string', description: 't', required: false }],
        riskLevel,
      } as any,
      mockDelegation as any,
      base,
      audience,
    );

  const headersOf = async (tool: ProxyTool, args: Record<string, unknown>) => {
    const origFetch = global.fetch;
    let captured: { headers: Record<string, string> } | null = null;
    global.fetch = (async (_url: string, init: any) => {
      captured = { headers: init.headers };
      return { ok: true, status: 200, json: async () => ({ id: 1 }), text: async () => '' } as any;
    }) as any;
    try {
      await tool.execute(args, 'u1');
    } finally {
      global.fetch = origFetch;
    }
    return captured!.headers;
  };

  it('**写**请求带上它，且值就是作用域里那个键（两侧同一个键）', async () => {
    const headers = await outboundIdempotencyKey.run('ledger-key-1', () =>
      headersOf(proxyTool('POST', '/contracts', 'R3'), { title: 'x' }),
    );

    expect(headers['Idempotency-Key']).toBe('ledger-key-1');
  });

  it('**反向对照**：读请求**不带**（幂等键是写语义）', async () => {
    const headers = await outboundIdempotencyKey.run('ledger-key-1', () =>
      headersOf(proxyTool('GET', '/contracts', 'R1'), {}),
    );

    expect(headers['Idempotency-Key']).toBeUndefined();
  });

  it('**反向对照**：作用域缺席 ⇒ **不发头**（没走过认领路径就没有键）', async () => {
    const headers = await headersOf(proxyTool('POST', '/contracts', 'R3'), { title: 'x' });

    expect(headers['Idempotency-Key']).toBeUndefined();
  });
});
