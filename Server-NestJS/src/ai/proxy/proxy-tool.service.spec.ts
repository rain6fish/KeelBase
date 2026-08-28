import { ProxyToolRegistryService } from './proxy-tool.service';
import { ToolRegistry } from '../tools/tool-registry';

describe('ProxyToolRegistryService（AI Bridge B 路径配置注册）', () => {
  let settingsValue: unknown;
  const mockSettings = {
    getWithDefault: jest.fn(async () => settingsValue),
  };
  const mockDelegation = {
    sign: jest.fn(async () => ({ token: 'jwt', subject: 's', expiresIn: 300 })),
  };

  beforeEach(() => {
    settingsValue = null;
    jest.clearAllMocks();
  });

  it('无配置 → 不注册', async () => {
    const svc = new ProxyToolRegistryService(mockSettings as any, mockDelegation as any, new ToolRegistry());
    const r = await svc.loadAndRegister();
    expect(r.registered).toEqual([]);
  });

  it('配置有效 → 动态注册读/写工具（写缺省 R3 需确认）', async () => {
    settingsValue = JSON.stringify({
      baseUrl: 'http://localhost:4000/api',
      audience: 'legacy-erp',
      tools: [
        { name: 'proxy_list', description: '列合同', method: 'GET', path: '/contracts', parameters: [] },
        { name: 'proxy_create', description: '建合同', method: 'POST', path: '/contracts', parameters: [{ name: 'title', type: 'string', description: '标题', required: true }] },
      ],
    });
    const registry = new ToolRegistry();
    const svc = new ProxyToolRegistryService(mockSettings as any, mockDelegation as any, registry);
    const r = await svc.loadAndRegister();
    expect(r.registered).toEqual(['proxy_list', 'proxy_create']);
    expect(r.skipped).toEqual([]);
    // 读自动 / 写需确认
    expect(registry.requiresConfirmation('proxy_list')).toBe(false);
    expect(registry.requiresConfirmation('proxy_create')).toBe(true);
    // 工具定义可用（LLM 可见）
    const defs = registry.getToolDefinitions().map((d) => d.function.name);
    expect(defs).toContain('proxy_list');
  });

  it('幂等：重复 load 跳过已注册名', async () => {
    settingsValue = JSON.stringify({
      baseUrl: 'http://x',
      audience: 'a',
      tools: [{ name: 'proxy_list', description: 'd', method: 'GET', path: '/c', parameters: [] }],
    });
    const registry = new ToolRegistry();
    const svc = new ProxyToolRegistryService(mockSettings as any, mockDelegation as any, registry);
    await svc.loadAndRegister();
    const second = await svc.loadAndRegister();
    expect(second.registered).toEqual([]);
    expect(second.skipped).toEqual(['proxy_list']);
  });

  it('baseUrl 非法（非 URL / ftp:）→ 跳过全部注册并记录（SSRF 防护）', async () => {
    for (const bad of ['not-a-url', 'ftp://x']) {
      settingsValue = JSON.stringify({
        baseUrl: bad,
        audience: 'a',
        tools: [{ name: 't', description: 'd', method: 'GET', path: '/c', parameters: [] }],
      });
      const svc = new ProxyToolRegistryService(mockSettings as any, mockDelegation as any, new ToolRegistry());
      const r = await svc.loadAndRegister();
      expect(r.registered).toEqual([]);
      expect(r.skipped.length).toBeGreaterThan(0);
      expect(r.skipped[0]).toMatch(/baseUrl/);
    }
  });

  it('非法 JSON / 缺 baseUrl → 静默跳过', async () => {
    settingsValue = '{bad json';
    const svc = new ProxyToolRegistryService(mockSettings as any, mockDelegation as any, new ToolRegistry());
    expect(await svc.loadAndRegister()).toEqual({ registered: [], skipped: [] });

    settingsValue = JSON.stringify({ audience: 'a', tools: [] }); // 缺 baseUrl
    const svc2 = new ProxyToolRegistryService(mockSettings as any, mockDelegation as any, new ToolRegistry());
    expect(await svc2.loadAndRegister()).toEqual({ registered: [], skipped: [] });
  });
});
