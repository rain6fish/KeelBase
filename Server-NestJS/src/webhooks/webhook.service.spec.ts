import { WebhookService } from './webhook.service';
import { WebhookSubscription } from './webhook-subscription.entity';
import { lookup } from 'dns/promises';

jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));

// 捕获真实 _isBlockedHost 实现（beforeEach 会替换为 mock，单独测真实解析分支用）
const realIsBlockedHost = (WebhookService.prototype as any)._isBlockedHost;

function makeRepo(seed: Partial<WebhookSubscription>[] = []) {
  let rows: WebhookSubscription[] = seed.map((s) => ({
    id: s.id ?? 1,
    userId: s.userId ?? 1,
    name: s.name ?? '',
    url: s.url ?? '',
    eventsJson: s.eventsJson ?? '[]',
    secret: s.secret ?? 'sec',
    enabled: s.enabled ?? true,
    createdAt: s.createdAt ?? new Date(),
  }));
  return {
    save: jest.fn(async (x: Partial<WebhookSubscription>) => {
      const full = { id: rows.length + 1, userId: 1, name: '', url: '', eventsJson: '[]', secret: 'sec', enabled: true, createdAt: new Date(), ...x };
      rows = [full, ...rows];
      return full;
    }),
    find: jest.fn(async (opts: any) => {
      let out = rows;
      if (opts?.where?.enabled !== undefined) out = out.filter((r) => r.enabled === opts.where.enabled);
      if (opts?.where?.userId !== undefined) out = out.filter((r) => r.userId === opts.where.userId);
      return out;
    }),
    findOne: jest.fn(async (opts: any) => rows.find((r) => r.id === opts.where.id) ?? null),
    delete: jest.fn(async () => ({ affected: 1 })),
    create: jest.fn((x: object) => x as WebhookSubscription),
  };
}

describe('WebhookService (PL-14)', () => {
  // SSRF 门控默认放行（公网目标）；SSRF 用例覆盖阻止分支；_isPrivateV4/V6 单独测
  beforeEach(() => {
    (WebhookService.prototype as any)._isBlockedHost = jest.fn().mockResolvedValue(false);
  });
  const base = () => ({
    userId: 1,
    name: 'ops',
    url: 'https://hook.example.com/ops',
    eventsJson: JSON.stringify(['feedback.created', 'todo.created']),
    secret: 'abcdef123456',
    enabled: true,
  });

  it('subscribe 生成 secret 并保存', async () => {
    const repo = makeRepo();
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const sub = await svc.subscribe(1, { name: 'ops', url: 'https://hook.example.com', events: ['feedback.created'] });
    expect(sub.events).toEqual(['feedback.created']);
    expect(sub.secret).toBeUndefined(); // 视图不暴露 secret
    expect(repo.save).toHaveBeenCalled();
    // 存储含 64 位 hex secret
    const saved = repo.save.mock.calls[0][0];
    expect(String(saved.secret)).toHaveLength(64);
  });

  it('list 返回本人订阅（视图不含 secret）', async () => {
    const repo = makeRepo([{ ...base(), id: 7 } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const list = await svc.list(1);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(7);
    expect((list[0] as any).secret).toBeUndefined();
  });

  it('remove 只删本人订阅', async () => {
    const repo = makeRepo();
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    await svc.remove(1, 5);
    expect(repo.delete).toHaveBeenCalledWith({ id: 5, userId: 1 });
  });

  it('SSRF：目标被判定为内网/回环时阻止投递', async () => {
    (WebhookService.prototype as any)._isBlockedHost = jest.fn().mockResolvedValue(true);
    const repo = makeRepo([{ ...base(), id: 1, url: 'http://127.0.0.1:5432/x' } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;

    await svc.publish('feedback.created', {});

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SSRF：重定向到私网目标同样阻止（redirect:manual 逐跳校验）', async () => {
    const repo = makeRepo([{ ...base(), id: 1 } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ status: 302, ok: false, headers: { get: () => 'http://169.254.169.254/latest' } });
    (global as any).fetch = fetchMock;
    // 顺序：_deliver 顶部初检(放行) → guard hop0 初检(放行, fetch→302) → guard hop1 重定向目标(阻止)
    (WebhookService.prototype as any)._isBlockedHost = jest
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await svc.publish('feedback.created', {});

    expect(fetchMock).toHaveBeenCalledTimes(1); // 重定向第二跳被阻止，不再发起
    const init = fetchMock.mock.calls[0][1];
    expect(init.redirect).toBe('manual');
  });

  it('SSRF：合法 302 重定向到公网目标正常跟随', async () => {
    const repo = makeRepo([{ ...base(), id: 1 } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ status: 302, ok: false, headers: { get: () => 'https://hook2.example.com/final' } })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;
    // 每次 host 都放行（初始 + hop0 + hop1）
    (WebhookService.prototype as any)._isBlockedHost = jest
      .fn()
      .mockResolvedValue(false);

    const out = await svc.testDeliver(1, 1);

    expect(out.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 初始 → 302 → 跟随到公网目标
  });

  it('SSRF：_isPrivateV4/V6 判定私网/回环/链接本地', () => {
    const S = WebhookService as any;
    expect(S._isPrivateV4('127.0.0.1')).toBe(true); // 回环
    expect(S._isPrivateV4('10.0.0.1')).toBe(true); // 私网
    expect(S._isPrivateV4('192.168.1.1')).toBe(true); // 私网
    expect(S._isPrivateV4('169.254.169.254')).toBe(true); // 云元数据/链接本地
    expect(S._isPrivateV4('8.8.8.8')).toBe(false); // 公网
    expect(S._isPrivateV6('::1')).toBe(true); // 回环
    expect(S._isPrivateV6('fe80::1')).toBe(true); // 链接本地
    expect(S._isPrivateV6('2001:4860:4860::8888')).toBe(false); // 公网
  });

  it('publish 只投递事件匹配且启用的订阅，带 HMAC 签名', async () => {
    const repo = makeRepo([
      { ...base(), id: 1, eventsJson: JSON.stringify(['feedback.created']) } as Partial<WebhookSubscription>,
      { ...base(), id: 2, url: 'https://hook2.example.com', enabled: false } as Partial<WebhookSubscription>,
    ]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;

    await svc.publish('feedback.created', { type: 'bug', userId: '1' });

    expect(fetchMock).toHaveBeenCalledTimes(1); // 停用的 id=2 不投递
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hook.example.com/ops');
    expect(init.headers['X-Webhook-Event']).toBe('feedback.created');
    expect(init.headers['X-Webhook-Signature']).toHaveLength(64);
    expect(JSON.parse(init.body).event).toBe('feedback.created');
  });

  it('publish 事件不匹配 → 不投递', async () => {
    const repo = makeRepo([{ ...base(), eventsJson: JSON.stringify(['todo.created']) } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    await svc.publish('feedback.created', {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('publish 投递失败静默（不抛异常）', async () => {
    const repo = makeRepo([{ ...base() } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const fetchMock = jest.fn().mockRejectedValue(new Error('conn refused'));
    (global as any).fetch = fetchMock;
    await expect(svc.publish('feedback.created', {})).resolves.toBeUndefined();
  });

  it('投递失败按配置重试多次（可靠性）', async () => {
    const repo = makeRepo([{ ...base() } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 3, backoffMs: 0 } as any);
    const fetchMock = jest.fn().mockRejectedValue(new Error('conn refused'));
    (global as any).fetch = fetchMock;
    await svc.publish('feedback.created', {});
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('首次失败后第二次成功 → 不再重试', async () => {
    const repo = makeRepo([{ ...base() } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 3, backoffMs: 0 } as any);
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('conn refused'))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;
    await svc.publish('feedback.created', {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('testDeliver 返回签名与结果', async () => {
    const repo = makeRepo([{ ...base(), id: 3 } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;
    const out = await svc.testDeliver(1, 3);
    expect(out.delivered).toBe(true);
    expect(out.signature).toHaveLength(64);
  });

  it('testDeliver 未知订阅 → 错误', async () => {
    const repo = makeRepo([{ ...base(), id: 3 } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const out = await svc.testDeliver(1, 99);
    expect(out.delivered).toBe(false);
    expect(out.error).toContain('not found');
  });

  it('setEnabled 启用/停用本人订阅并返回视图（不含 secret）', async () => {
    const repo = makeRepo([{ ...base(), id: 3 } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const view = await svc.setEnabled(1, 3, false);
    expect(view).not.toBeNull();
    expect(view!.enabled).toBe(false);
    expect((view as any).secret).toBeUndefined();
  });

  it('setEnabled 订阅不存在或非本人 → null', async () => {
    const repo = makeRepo([{ ...base(), id: 3 } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    await expect(svc.setEnabled(1, 99, true)).resolves.toBeNull();
  });

  it('HTTP 非 2xx 状态码 → 投递失败返回 HTTP 状态错误', async () => {
    const repo = makeRepo([{ ...base(), id: 1 } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    (global as any).fetch = fetchMock;
    const out = await svc.testDeliver(1, 1);
    expect(out.delivered).toBe(false);
    expect(out.error).toBe('HTTP 500');
  });

  it('重定向响应无 Location 头 → 按当前响应判定（不无限跟随）', async () => {
    const repo = makeRepo([{ ...base(), id: 1 } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const fetchMock = jest.fn().mockResolvedValue({ status: 302, ok: false, headers: { get: () => null } });
    (global as any).fetch = fetchMock;
    const out = await svc.testDeliver(1, 1);
    expect(out.delivered).toBe(false);
    expect(out.error).toBe('HTTP 302');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('重定向超过上限 → 判定失败（防重定向环）', async () => {
    const repo = makeRepo([{ ...base(), id: 1 } as Partial<WebhookSubscription>]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ status: 302, ok: false, headers: { get: () => 'https://hop.example.com/next' } });
    (global as any).fetch = fetchMock;
    const out = await svc.testDeliver(1, 1);
    expect(out.delivered).toBe(false);
    expect(out.error).toBe('too-many-redirects');
    // 初始 URL 一次 + 5 跳 → 6 次 fetch 后中止
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('_isBlockedHost 真实实现：解析失败保守阻止；私网/公网正确判定', async () => {
    (WebhookService.prototype as any)._isBlockedHost = realIsBlockedHost;
    const mockLookup = lookup as jest.Mock;
    const svc = new WebhookService(makeRepo() as any, { attempts: 1, backoffMs: 0 } as any);

    // DNS 解析失败 → 保守阻止
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect((svc as any)._isBlockedHost('nope.example.com')).resolves.toBe(true);

    // 公网 IPv4 → 放行
    mockLookup.mockResolvedValue([{ address: '8.8.8.8' }]);
    await expect((svc as any)._isBlockedHost('public.example.com')).resolves.toBe(false);

    // 私网 IPv4 → 阻止
    mockLookup.mockResolvedValue([{ address: '10.1.2.3' }]);
    await expect((svc as any)._isBlockedHost('private.example.com')).resolves.toBe(true);

    // IPv6 回环/链接本地 → 阻止；公网 IPv6 → 放行
    mockLookup.mockResolvedValue([{ address: '::1' }]);
    await expect((svc as any)._isBlockedHost('v6.example.com')).resolves.toBe(true);
    mockLookup.mockResolvedValue([{ address: '2001:4860:4860::8888' }]);
    await expect((svc as any)._isBlockedHost('v6pub.example.com')).resolves.toBe(false);

    // 解析出非 IP 地址 → 保守阻止
    mockLookup.mockResolvedValue([{ address: 'not-an-ip' }]);
    await expect((svc as any)._isBlockedHost('bad.example.com')).resolves.toBe(true);
  });

  it('eventsJson 非法 JSON 或非数组 → events 视为空', async () => {
    const repo = makeRepo([
      { ...base(), id: 1, eventsJson: 'not-json{' } as Partial<WebhookSubscription>,
      { ...base(), id: 2, eventsJson: JSON.stringify({ a: 1 }) } as Partial<WebhookSubscription>,
    ]);
    const svc = new WebhookService(repo as any, { attempts: 1, backoffMs: 0 } as any);
    const list = await svc.list(1);
    expect(list[0].events).toEqual([]);
    expect(list[1].events).toEqual([]);
  });
});
