import { WxSubscribeService } from './wx-subscribe.service';
import { ConfigService } from '@nestjs/config';

describe('WxSubscribeService（MINI-2 微信订阅消息）', () => {
  let service: WxSubscribeService;
  let fetchMock: jest.Mock;
  const mockUserRepo = { findOne: jest.fn() };
  const config = {
    get: jest.fn((key: string, d?: unknown) => {
      const map: Record<string, unknown> = {
        WECHAT_APP_ID: 'wx-appid',
        WECHAT_APP_SECRET: 'wx-secret',
        WECHAT_REMIND_TEMPLATE_ID: 'TPL_001',
      };
      return map[key] ?? d;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    // 默认完整配置；各测试按需覆盖（clearAllMocks 不清 mockImplementation，须在此重置）
    config.get.mockImplementation((key: string, d?: unknown) => {
      const map: Record<string, unknown> = {
        WECHAT_APP_ID: 'wx-appid',
        WECHAT_APP_SECRET: 'wx-secret',
        WECHAT_REMIND_TEMPLATE_ID: 'TPL_001',
      };
      return map[key] ?? d;
    });
    service = new WxSubscribeService(mockUserRepo as any, config as unknown as ConfigService);
  });

  it('未配置模板 ID → 降级 no-op（不调 fetch、不查用户）', async () => {
    config.get.mockImplementation((key: string, d?: unknown) =>
      key === 'WECHAT_REMIND_TEMPLATE_ID' ? '' : d,
    );
    await service.sendReminder(1, '会议');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockUserRepo.findOne).not.toHaveBeenCalled();
  });

  it('未配置 appid/secret → 降级 no-op', async () => {
    config.get.mockImplementation((key: string, d?: unknown) =>
      key === 'WECHAT_APP_ID' || key === 'WECHAT_APP_SECRET' ? '' : d,
    );
    await service.sendReminder(1, '会议');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('非微信登录用户 → no-op（不发订阅消息）', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 1, provider: 'google', providerId: 'google-id' });
    await service.sendReminder(1, '会议');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('配置 + 微信用户 → 换 access_token 并发送订阅消息', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 1, provider: 'wechat', providerId: 'openid-123' });
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ access_token: 'TOKEN', expires_in: 7200 }) })
      .mockResolvedValueOnce({ json: async () => ({ errcode: 0 }) });
    await service.sendReminder(1, '会议');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const tokenCall = fetchMock.mock.calls[0];
    expect(tokenCall[0]).toContain('/cgi-bin/token');
    expect(tokenCall[0]).toContain('wx-appid');
    const sendCall = fetchMock.mock.calls[1];
    expect(sendCall[0]).toContain('/cgi-bin/message/subscribe/send');
    expect(sendCall[0]).toContain('access_token=TOKEN');
    const body = JSON.parse(sendCall[1].body);
    expect(body.touser).toBe('openid-123');
    expect(body.template_id).toBe('TPL_001');
    expect(body.data.thing1.value).toBe('会议');
  });

  it('access_token 缓存：连续发送只换一次 token', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 1, provider: 'wechat', providerId: 'openid-123' });
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ access_token: 'TOKEN', expires_in: 7200 }) })
      .mockResolvedValueOnce({ json: async () => ({ errcode: 0 }) })
      .mockResolvedValueOnce({ json: async () => ({ errcode: 0 }) });
    await service.sendReminder(1, 'a');
    await service.sendReminder(1, 'b');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const tokenCalls = fetchMock.mock.calls.filter((c) => c[0].includes('/token'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('微信 send 返回 errcode≠0 → 抛错被 catch（不崩主流程）', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 1, provider: 'wechat', providerId: 'openid-123' });
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ access_token: 'TOKEN', expires_in: 7200 }) })
      .mockResolvedValueOnce({ json: async () => ({ errcode: 40001, errmsg: 'invalid credential' }) });
    await expect(service.sendReminder(1, '会议')).resolves.toBeUndefined();
    expect(mockUserRepo.findOne).toHaveBeenCalled();
  });
});
