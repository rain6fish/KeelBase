// SPDX-License-Identifier: Apache-2.0

import { SidecarRegistryService } from './sidecar-registry.service';

describe('SidecarRegistryService（B2 治理策略实时推送）', () => {
  let registry: SidecarRegistryService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    registry = new SidecarRegistryService();
    fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    process.env.GOVERNANCE_API_KEY = 'gov-key';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (process.env as Record<string, string | undefined>).GOVERNANCE_API_KEY;
  });

  it('register：合法 http(s) 回调可注册（幂等覆盖）', () => {
    expect(registry.register('http://sidecar:3200')).toEqual({ registered: true, total: 1 });
    expect(registry.register('https://sidecar.example.com')).toEqual({ registered: true, total: 2 });
    expect(registry.register('http://sidecar:3200')).toEqual({ registered: true, total: 2 }); // 幂等
  });

  it('register：非法回调 → 400', () => {
    expect(() => registry.register('')).toThrow();
    expect(() => registry.register('ftp://x')).toThrow();
    expect(() => registry.register('javascript:alert(1)')).toThrow();
  });

  it('pushPolicy：向已注册 sidecar 广播 POST /v1/policy（服务身份）', async () => {
    registry.register('http://sidecar:3200');
    registry.register('http://sidecar2:3200');
    const policy = { tools: { send_email: { enabled: false } } };
    const res = await registry.pushPolicy(policy);
    expect(res).toEqual({ pushed: 2, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://sidecar:3200/v1/policy');
    expect((init as { headers: Record<string, string> }).headers['x-api-key']).toBe('gov-key');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.policy).toEqual(policy);
    expect(body.pushedAt).toBeDefined();
  });

  it('pushPolicy：单 sidecar 失败不影响其他（fire-and-forget，轮询兜底）', async () => {
    registry.register('http://ok:3200');
    registry.register('http://fail:3200');
    fetchMock
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('conn refused'));
    const res = await registry.pushPolicy({});
    expect(res).toEqual({ pushed: 1, failed: 1 });
  });
});
