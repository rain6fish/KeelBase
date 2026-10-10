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

  it('proxyErrorText：超时 → "超时"；其余异常 → 不断言"不可达"（结果未知 / 可能已到达）', () => {
    expect(proxyErrorText(new ProxyTimeoutError(30), '目标系统')).toContain('请求超时');
    const other = proxyErrorText(new Error('socket hang up'), '补偿端点');
    expect(other).not.toContain('不可达');
    expect(other).toContain('可能已到达');
    expect(other).toContain('本次不重试');
  });

  it('proxyErrorText：连接没建立 → "不可达"（这一读支持得起）；发出后才断的仍读作不确定', () => {
    // 连接根本没建立——请求不可能发出去，「没送到」这一读是传输层支持得起的。
    expect(proxyErrorText(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), '目标系统'))
      .toContain('不可达');
    // undici 把底层码挂在 cause 上——两处都要认，否则真实运行时那一类会漏读成不确定。
    const viaCause = Object.assign(new Error('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });
    expect(proxyErrorText(viaCause, '目标系统')).toContain('不可达');
    // 发出**之后**才断的（无码的 socket hang up、ECONNRESET）不准读作不可达——目标可能已经收到。
    for (const err of [
      new Error('socket hang up'),
      Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
    ]) {
      const text = proxyErrorText(err, '目标系统');
      expect(text).not.toContain('不可达');
      expect(text).toContain('可能已到达');
    }
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
