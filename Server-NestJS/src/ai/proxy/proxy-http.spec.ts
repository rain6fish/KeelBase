// SPDX-License-Identifier: Apache-2.0

import { ProxyTimeoutError, proxyFetch, proxyErrorText, getProxyTimeout } from './proxy-http';

describe('proxy-http（B 路径外部调用超时守卫，KB-4 FP-3）', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
    jest.restoreAllMocks();
  });

  /** 永不返回的 fetch，但尊重 AbortSignal：abort → reject AbortError（模拟真实 fetch 挂起后被中止） */
  const hangingFetch = (_url: unknown, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      );
    });

  it('proxyFetch 超时 → 抛 ProxyTimeoutError（name 可辨识），不无限挂起', async () => {
    global.fetch = hangingFetch as unknown as typeof fetch;
    await expect(proxyFetch('http://legacy/x', {}, 30)).rejects.toMatchObject({
      name: 'ProxyTimeoutError',
    });
  });

  it('proxyFetch 成功 → 原样返回 Response（透传 status/body）', async () => {
    global.fetch = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;
    const res = await proxyFetch('http://legacy/x', {}, 30);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it('proxyFetch 网络错误 → 原样透传（非超时不被吞）', async () => {
    global.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(proxyFetch('http://legacy/x', {}, 30)).rejects.toThrow('ECONNREFUSED');
  });

  it('proxyErrorText：ProxyTimeoutError → "超时"；一般错误 → "不可达"', () => {
    expect(proxyErrorText(new ProxyTimeoutError(30), '目标系统')).toContain('请求超时');
    expect(proxyErrorText(new Error('reset'), '补偿端点')).toContain('不可达');
  });

  it('getProxyTimeout：调用期读取 PROXY_FETCH_TIMEOUT_MS（未配/非法 → 30000）', () => {
    const prev = process.env.PROXY_FETCH_TIMEOUT_MS;
    try {
      delete process.env.PROXY_FETCH_TIMEOUT_MS;
      expect(getProxyTimeout()).toBe(30_000);
      process.env.PROXY_FETCH_TIMEOUT_MS = '5000';
      expect(getProxyTimeout()).toBe(5000);
      process.env.PROXY_FETCH_TIMEOUT_MS = 'not-a-number';
      expect(getProxyTimeout()).toBe(30_000);
    } finally {
      if (prev === undefined) delete process.env.PROXY_FETCH_TIMEOUT_MS;
      else process.env.PROXY_FETCH_TIMEOUT_MS = prev;
    }
  });
});
