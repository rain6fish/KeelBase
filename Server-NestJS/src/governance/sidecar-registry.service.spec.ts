// SPDX-License-Identifier: Apache-2.0

import { SidecarRegistryService } from './sidecar-registry.service';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('register：拒绝私网/回环/链路本地/云元数据的**字面 IP**（SSRF 纵深，复用 common/utils/ssrf）', () => {
    expect(() => registry.register('http://10.0.0.5/hook')).toThrow(); // 私网
    expect(() => registry.register('http://127.0.0.1/x')).toThrow(); // 回环
    expect(() => registry.register('http://169.254.169.254/')).toThrow(); // 云元数据/链接本地
    expect(() => registry.register('http://192.168.1.1:3200')).toThrow(); // 私网
    expect(() => registry.register('http://[::1]:3200')).toThrow(); // IPv6 回环
    expect(() => registry.register('http://[fe80::1]/x')).toThrow(); // IPv6 链接本地
    expect(registry.list()).toHaveLength(0); // 一个都没进表
  });

  it('register：公网字面 IP 与主机名放行（不解析主机名——标准部署用内网主机名）', () => {
    expect(registry.register('http://8.8.8.8:3200')).toEqual({ registered: true, total: 1 });
    // 主机名一律放行（DNS 解析式拦截会误伤 docs/manual/governance-deploy.md 的 `http://sidecar:3200`）
    expect(registry.register('http://sidecar:3200')).toEqual({ registered: true, total: 2 });
    expect(registry.register('https://sidecar.example.com')).toEqual({ registered: true, total: 3 });
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
    // ② 绑定：策略推送体键集 == sidecar-policy-push 冻结契约
    const spProps = Object.keys(
      (
        JSON.parse(
          readFileSync(resolve(__dirname, '../../specs/protocol/schemas/v1/sidecar-policy-push.schema.json'), 'utf8'),
        ) as { properties: Record<string, unknown> }
      ).properties,
    );
    expect(Object.keys(body).sort()).toEqual(spProps.sort());
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
