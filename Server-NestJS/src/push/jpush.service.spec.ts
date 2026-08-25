import { ConfigService } from '@nestjs/config';
import { JPushService } from './jpush.service';

describe('JPushService', () => {
  const mockFetch = jest.fn();

  beforeAll(() => {
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockConfig(appKey = 'appkey', secret = 'secret') {
    return {
      get: jest.fn((key: string, def?: any) => {
        const map: Record<string, string> = {
          JPUSH_APP_KEY: appKey,
          JPUSH_MASTER_SECRET: secret,
        };
        return map[key] ?? def;
      }),
    } as unknown as ConfigService;
  }

  it('sends to a device with Basic Auth and registration_id audience', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ msg_id: '123' }),
    });
    const service = new JPushService(mockConfig());

    await service.sendToDevice('reg-abc', { title: '提醒', body: '内容', data: { page: '/events' } });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.jpush.cn/v3/push');
    expect(init.method).toBe('POST');
    const expectedAuth = Buffer.from('appkey:secret').toString('base64');
    expect(init.headers.Authorization).toBe(`Basic ${expectedAuth}`);
    const body = JSON.parse(init.body);
    expect(body.platform).toBe('all');
    expect(body.audience.registration_id).toEqual(['reg-abc']);
    expect(body.notification.alert).toBe('提醒');
    expect(body.notification.android.title).toBe('提醒');
    expect(body.notification.ios.extras).toEqual({ page: '/events' });
  });

  it('sends to a topic with tag audience', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ msg_id: '456' }) });
    const service = new JPushService(mockConfig());

    await service.sendToTopic('vip', { title: 'T', body: 'B' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.audience.tag).toEqual(['vip']);
  });

  it('no-ops without credentials (degraded)', async () => {
    const service = new JPushService(mockConfig('', ''));

    expect(service.enabled).toBe(false);
    await service.sendToDevice('reg', { title: 'T', body: 'B' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws on non-2xx response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    });
    const service = new JPushService(mockConfig());

    await expect(service.sendToDevice('reg', { title: 'T', body: 'B' }))
      .rejects.toThrow('JPush API error: 401');
  });

  it('sendToTopic no-ops without credentials (degraded)', async () => {
    const service = new JPushService(mockConfig('', ''));

    await service.sendToTopic('vip', { title: 'T', body: 'B' });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('posts directly when no circuit breaker injected (else branch)', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ msg_id: 'cb' }) });
    const service = new JPushService(mockConfig());

    await service.sendToDevice('reg-cb', { title: 'T', body: 'B' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('routes through circuit breaker when injected', async () => {
    const fire = jest.fn(async (_n: string, fn: () => Promise<void>) => fn());
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ msg_id: 'cb2' }) });
    const service = new JPushService(mockConfig(), { fire } as any);

    await service.sendToDevice('reg-cb2', { title: 'T', body: 'B' });

    expect(fire).toHaveBeenCalledWith('jpush', expect.any(Function));
    expect(mockFetch).toHaveBeenCalled();
  });
});
