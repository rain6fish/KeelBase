// SPDX-License-Identifier: Apache-2.0

/**
 * GovernanceReporter（D2-3b 审计/副作用双写上报）单元测试
 *
 * 覆盖：未配置时 enabled=false 不 fetch；配置后 audit/effect 上报 URL/服务身份/请求体；上报失败静默不抛。
 */

import { ConfigService } from '@nestjs/config';
import { GovernanceReporter } from './governance-reporter.service';

describe('GovernanceReporter（D2-3b 审计/副作用双写上报）', () => {
  const cfg = (over: Record<string, string> = {}) =>
    ({ get: (key: string) => over[key] ?? null }) as unknown as ConfigService;

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('未配置 GOVERNANCE_URL → enabled=false，上报不 fetch', async () => {
    const reporter = new GovernanceReporter(cfg());
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    expect(reporter.enabled).toBe(false);
    await reporter.reportAudit({ action: 'chat' });
    await reporter.reportEffect({ resultType: 'event', resultId: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('配置后 enabled=true，reportAudit 上报 /external/audit 带服务身份', async () => {
    const reporter = new GovernanceReporter(cfg({ GOVERNANCE_URL: 'http://gov:3100', GOVERNANCE_API_KEY: 'gov-key' }));
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as any).fetch = fetchMock;
    expect(reporter.enabled).toBe(true);
    await reporter.reportAudit({ action: 'tool_call', provider: 'deepseek' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gov:3100/api/v1/external/audit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json', 'x-api-key': 'gov-key' }),
        body: JSON.stringify({ action: 'tool_call', provider: 'deepseek' }),
      }),
    );
  });

  it('reportEffect 上报 /external/effects（幂等键去重由治理台处理）', async () => {
    const reporter = new GovernanceReporter(cfg({ GOVERNANCE_URL: 'http://gov:3100' }));
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as any).fetch = fetchMock;
    await reporter.reportEffect({ resultType: 'crm_task', resultId: 7 });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gov:3100/api/v1/external/effects',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ resultType: 'crm_task', resultId: 7 }),
      }),
    );
  });

  it('上报失败静默（不阻塞本地审计/工具执行）', async () => {
    const reporter = new GovernanceReporter(cfg({ GOVERNANCE_URL: 'http://gov:3100' }));
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(reporter.reportAudit({ action: 'chat' })).resolves.toBeUndefined();
    await expect(reporter.reportEffect({})).resolves.toBeUndefined();
  });
});
