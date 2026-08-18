import { WebhookService } from './webhook.service';
import { WebhookSubscription } from './webhook-subscription.entity';

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
});
