// SPDX-License-Identifier: Apache-2.0

import { ProxyTool, ProxyToolConfig } from './proxy-tool';
import { ProxyTargetStatusProbe } from './target-status';
import { ToolRegistry } from '../tools/tool-registry';

/**
 * AW-17: the read-only target-status probe.
 *
 * The cases are chosen so that the **two readings the item exists to keep apart** are pinned by
 * assertions rather than by prose:
 *
 * - a target that answers `executed` / `not_executed` produces that conclusion, and the request that
 *   got it was a single `GET` — the write is never re-sent (a `POST` status path or an unfilled
 *   placeholder sends **nothing at all**);
 * - every way of **not** getting an answer (no channel, timeout, unreachable, non-2xx, an unknown
 *   body) concludes `unknown`. If any of them concluded `not_executed`, "we could not ask" would be
 *   recorded as "it did not happen" — the exact misreading this item was raised to prevent.
 *
 * AW-17：只读目标状态探针。
 *
 * 用例的选择让本项要分开的**两个读数**由断言钉住，而不是靠散文：
 *
 * - 目标答 `executed` / `not_executed` ⇒ 结论就是它，且拿到它的那次请求是**一次 `GET`** —— 写绝不重发
 *   （配成 `POST` 状态路径、或占位没填完，都**一个字节都不发**）；
 * - 每一种**拿不到**答案的情形（没有通道、超时、不可达、非 2xx、认不出的响应）结论都是 `unknown`。
 *   若有任何一种结论成 `not_executed`，「问不到」就会被记成「没发生」—— 正是本项要防的那个误读。
 */
const base = 'http://localhost:4000/api';
const audience = 'legacy-erp';

const delegation = {
  sign: jest.fn(async (userId: string, aud: string) => ({ token: `jwt-${userId}-${aud}` })),
};

const writeTool = (overrides: Partial<ProxyToolConfig> = {}, timeoutMs?: number): ProxyTool =>
  new ProxyTool(
    {
      name: 'proxy_create_contract',
      description: '建合同',
      method: 'POST',
      path: '/contracts',
      parameters: [],
      // `revokeClass` is not needed: a ProxyTool always *sets* it in the constructor (KB-6's registry
      // guard only fires on an undefined one).
      ...overrides,
    },
    delegation as any,
    base,
    audience,
    timeoutMs,
  );

const probeFor = (...tools: ProxyTool[]): ProxyTargetStatusProbe => {
  const registry = new ToolRegistry();
  for (const t of tools) registry.register(t);
  return new ProxyTargetStatusProbe(registry, delegation as any);
};

type Captured = { url: string; method: string; headers: Record<string, string>; body: unknown };

const stubFetch = (responder: (url: string, init: RequestInit) => Promise<Response>) => {
  const calls: Captured[] = [];
  const orig = global.fetch;
  global.fetch = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: String(init?.method ?? 'GET'),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    });
    return responder(url, init);
  }) as unknown as typeof fetch;
  return {
    calls,
    restore: () => {
      global.fetch = orig;
    },
  };
};

const answer = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => '' }) as any;

describe('AW-17 目标状态查询（只读，一次）', () => {
  afterEach(() => jest.clearAllMocks());

  it('没配 statusPath ⇒ 不可问：结论 unknown，绝不猜成 not_executed', async () => {
    const probe = probeFor(writeTool());

    const r = await probe.lookup('proxy_create_contract', 'key-1', 'u1');

    expect(r.conclusion).toBe('unknown');
    expect(r.reason).toBe('target-status-unavailable');
  });

  it('目标答 executed ⇒ 结论 executed，且**只发一次 GET**（写不重发）', async () => {
    const probe = probeFor(writeTool({ statusPath: 'GET /contracts/status/{key}' }));

    const f = stubFetch(async () => answer({ status: 'executed' }));
    try {
      const r = await probe.lookup('proxy_create_contract', 'key/one', 'u-alice');
      expect(r.conclusion).toBe('executed');
      expect(r.reason).toBeNull();
      expect(r.queryMethod).toBe('GET');
      expect(r.queryPath).toBe('/contracts/status/key%2Fone');
    } finally {
      f.restore();
    }

    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].method).toBe('GET');
    expect(f.calls[0].body).toBeUndefined();
    expect(f.calls[0].url).toBe(`${base}/contracts/status/key%2Fone`);
    // The writer's identity, not the administrator's: the target authorizes that user's scope.
    expect(f.calls[0].headers.Authorization).toBe('Bearer jwt-u-alice-legacy-erp');
    expect(delegation.sign).toHaveBeenCalledWith('u-alice', audience);
  });

  it('目标答 not_executed ⇒ 结论 not_executed', async () => {
    const probe = probeFor(writeTool({ statusPath: '/contracts/status/{key}' }));

    const f = stubFetch(async () => answer({ status: 'not_executed' }));
    try {
      const r = await probe.lookup('proxy_create_contract', 'key-1', 'u1');
      expect(r.conclusion).toBe('not_executed');
      expect(r.reason).toBeNull();
    } finally {
      f.restore();
    }
    // A bare path means GET — the same default `revokePath` gets.
    expect(f.calls[0].method).toBe('GET');
  });

  it('**反向对照**：状态路径配成 POST ⇒ **一个字节都不发**（状态查询不能有写的可能）', async () => {
    const probe = probeFor(writeTool({ statusPath: 'POST /contracts/status/{key}' }));

    const f = stubFetch(async () => answer({ status: 'executed' }));
    try {
      const r = await probe.lookup('proxy_create_contract', 'key-1', 'u1');
      expect(r.conclusion).toBe('unknown');
      expect(r.reason).toBe('misconfigured');
    } finally {
      f.restore();
    }
    expect(f.calls).toHaveLength(0);
  });

  it('路径没有 {key}，或代入后还剩占位 ⇒ 拒绝发送（问的必须是我们知道的那件事）', async () => {
    for (const statusPath of ['GET /contracts/status', 'GET /contracts/{id}/status/{key}']) {
      const probe = probeFor(writeTool({ statusPath }));
      const f = stubFetch(async () => answer({ status: 'executed' }));
      try {
        const r = await probe.lookup('proxy_create_contract', 'key-1', 'u1');
        expect(r.conclusion).toBe('unknown');
        expect(r.reason).toBe('misconfigured');
      } finally {
        f.restore();
      }
      expect(f.calls).toHaveLength(0);
    }
  });

  it('超时 ⇒ unknown（timeout），绝不读成 not_executed', async () => {
    // 20ms 上限，避免真的等 30s
    const probe = probeFor(writeTool({ statusPath: 'GET /contracts/status/{key}' }, 20));

    const orig = global.fetch;
    let calls = 0;
    global.fetch = ((_url: unknown, init: RequestInit) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    }) as unknown as typeof fetch;
    try {
      const r = await probe.lookup('proxy_create_contract', 'key-1', 'u1');
      expect(r.conclusion).toBe('unknown');
      expect(r.reason).toBe('timeout');
    } finally {
      global.fetch = orig;
    }
    // One attempt. A query that did not answer is not retried — retrying would be traffic the target
    // never agreed to, and it would not make the answer any more knowable.
    expect(calls).toBe(1);
  });

  it('连接没建立（ECONNREFUSED）⇒ unknown（unreachable）', async () => {
    const probe = probeFor(writeTool({ statusPath: 'GET /contracts/status/{key}' }));
    const orig = global.fetch;
    global.fetch = (async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    }) as unknown as typeof fetch;
    try {
      const r = await probe.lookup('proxy_create_contract', 'key-1', 'u1');
      expect(r.conclusion).toBe('unknown');
      expect(r.reason).toBe('unreachable');
    } finally {
      global.fetch = orig;
    }
  });

  it('非 2xx ⇒ unknown（non_2xx）；认不出的响应体 ⇒ unknown（unrecognized_answer）', async () => {
    const probe = probeFor(writeTool({ statusPath: 'GET /contracts/status/{key}' }));
    const f1 = stubFetch(async () => answer({ status: 'executed' }, 500));
    try {
      const r = await probe.lookup('proxy_create_contract', 'key-1', 'u1');
      expect(r.conclusion).toBe('unknown');
      expect(r.reason).toBe('non_2xx');
    } finally {
      f1.restore();
    }

    const probe2 = probeFor(writeTool({ statusPath: 'GET /contracts/status/{key}' }));
    for (const body of [{ ok: true }, { status: 'maybe' }, null, 'executed']) {
      const f2 = stubFetch(async () => answer(body));
      try {
        const r = await probe2.lookup('proxy_create_contract', 'key-1', 'u1');
        expect(r.conclusion).toBe('unknown');
        expect(r.reason).toBe('unrecognized_answer');
      } finally {
        f2.restore();
      }
    }
  });

  it('工具不在注册表 / 不是代理工具 ⇒ 不可问（unknown），不抛', async () => {
    const probe = probeFor();
    const r = await probe.lookup('proxy_create_contract', 'key-1', 'u1');
    expect(r.conclusion).toBe('unknown');
    expect(r.reason).toBe('target-status-unavailable');
  });

  /**
   * AW-17 read side: "can this target be asked at all?" is a property of the tool, and the read
   * surface needs it **without performing a query** — a list of in-flight calls must be able to say
   * "this one cannot be reconciled" instead of offering an action that would only report
   * `target-status-unavailable`.
   *
   * AW-17 读侧：「这个目标能不能问」是工具的属性，读面必须**不发起查询**就能回答 —— 在途调用清单
   * 要能说「这条对不了账」，而不是给一个只会报 `target-status-unavailable` 的按钮。
   */
  it('canAsk：配了 statusPath 才是可问；没配 / 工具不存在 ⇒ false（不发任何请求）', () => {
    const f = stubFetch(async () => answer({ status: 'executed' }));
    try {
      const configured = probeFor(writeTool({ statusPath: 'GET /contracts/status/{key}' }));
      expect(configured.canAsk('proxy_create_contract')).toBe(true);

      const notConfigured = probeFor(writeTool());
      expect(notConfigured.canAsk('proxy_create_contract')).toBe(false);

      // Unknown tool / non-proxy tool ⇒ cannot ask, and the question itself is not a request.
      // 未知工具 / 非代理工具 ⇒ 问不了；而这个提问本身不构成任何请求。
      expect(configured.canAsk('no_such_tool')).toBe(false);
      expect(f.calls).toHaveLength(0);
    } finally {
      f.restore();
    }
  });
});
