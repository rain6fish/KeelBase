import { ProxyToolRevokerService } from './proxy-revoker.service';
import { ProxyTool } from './proxy-tool';
import { ToolRegistry } from '../tools/tool-registry';
import { DelegationTokenService } from '../../auth/delegation-token.service';

describe('ProxyToolRevokerService', () => {
  const mockFetch = jest.fn();
  let registry: { getTool: jest.Mock };
  let delegation: { sign: jest.Mock };
  let revoker: ProxyToolRevokerService;

  function makeProxy(over: Record<string, unknown> = {}) {
    return new ProxyTool(
      {
        name: 'proxy_create_contract',
        description: '创建合同（代理）',
        method: 'POST',
        path: '/contracts',
        parameters: [{ name: 'name', type: 'string', description: '名称', required: true }],
        ...(over.revokePath === undefined ? { revokePath: 'DELETE /contracts/{id}' } : { revokePath: over.revokePath }),
      },
      {} as any, // delegationService（ProxyTool.execute 才用，revoke 不经它）
      'http://java-crm:8080',
      'crm-java',
    ) as any;
  }

  beforeAll(() => {
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    registry = { getTool: jest.fn() };
    delegation = { sign: jest.fn() };
    revoker = new ProxyToolRevokerService(registry as unknown as ToolRegistry, delegation as any);
  });

  it('非 ProxyTool 工具 → 返回无法撤销（B 路径）', async () => {
    registry.getTool.mockReturnValue({ name: 'query_customers', execute: jest.fn() });

    const result = await revoker.revoke('query_customers', 7, '1');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('非 B 路径代理');
  });

  it('工具未注册（getTool 抛错）→ 返回无法撤销', async () => {
    registry.getTool.mockImplementation(() => {
      throw new Error('tool not found');
    });

    const result = await revoker.revoke('proxy_none', 7, '1');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('非 B 路径代理');
  });

  it('无 revokePath → 返回需 Java 端补偿', async () => {
    registry.getTool.mockReturnValue(makeProxy({ revokePath: null as any }));

    const result = await revoker.revoke('proxy_create_contract', 7, '1');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('未配置 revokePath');
  });

  it('成功撤销：解析方法/路径 + 占位替换 + 委托 token + 调补偿端点', async () => {
    registry.getTool.mockReturnValue(makeProxy());
    delegation.sign.mockResolvedValue({ token: 'delegation-token' });
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const result = await revoker.revoke('proxy_create_contract', 42, '1');

    expect(delegation.sign).toHaveBeenCalledWith('1', 'crm-java');
    expect(mockFetch).toHaveBeenCalledWith('http://java-crm:8080/contracts/42', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer delegation-token' },
    });
    expect(result).toEqual({ ok: true, message: 'DELETE /contracts/42' });
  });

  it('委托 token 签发失败 → 返回错误', async () => {
    registry.getTool.mockReturnValue(makeProxy());
    delegation.sign.mockRejectedValue(new Error('no audience'));

    const result = await revoker.revoke('proxy_create_contract', 7, '1');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('委托 token 签发失败');
  });

  it('补偿端点非 2xx → 返回状态错误', async () => {
    registry.getTool.mockReturnValue(makeProxy());
    delegation.sign.mockResolvedValue({ token: 't' });
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });

    const result = await revoker.revoke('proxy_create_contract', 7, '1');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('500');
  });

  it('补偿端点不可达 → 返回错误', async () => {
    registry.getTool.mockReturnValue(makeProxy());
    delegation.sign.mockResolvedValue({ token: 't' });
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await revoker.revoke('proxy_create_contract', 7, '1');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('不可达');
  });

  it('revokePath 仅路径（无方法前缀）→ 默认 POST', async () => {
    registry.getTool.mockReturnValue(makeProxy({ revokePath: '/contracts/{id}/cancel' }));
    delegation.sign.mockResolvedValue({ token: 't' });
    mockFetch.mockResolvedValue({ ok: true });

    const result = await revoker.revoke('proxy_create_contract', 7, '1');

    expect(mockFetch).toHaveBeenCalledWith('http://java-crm:8080/contracts/7/cancel', expect.objectContaining({ method: 'POST' }));
    expect(result.ok).toBe(true);
  });
});
