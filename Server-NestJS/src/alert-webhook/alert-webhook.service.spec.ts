// SPDX-License-Identifier: Apache-2.0

import { AlertWebhookService } from './alert-webhook.service';

function makeConfig(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    ALERT_WEBHOOK_ENABLED: true,
    ALERT_WEBHOOK_URL: 'https://example.com/webhook',
    ALERT_WEBHOOK_TYPE: 'dingtalk',
    ALERT_WEBHOOK_MIN_INTERVAL_SECONDS: 60,
  };
  return { get: jest.fn((key: string, def?: unknown) => overrides[key] ?? defaults[key] ?? def) } as any;
}

describe('AlertWebhookService', () => {
  it('未配置时 configured=false，不发送', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true });
    const svc = new AlertWebhookService(
      makeConfig({ ALERT_WEBHOOK_ENABLED: false }),
      fetchFn as any,
    );
    expect(svc.configured).toBe(false);
    await svc.sendAlert('t', 'm');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('钉钉类型发送 text 消息', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true });
    const svc = new AlertWebhookService(makeConfig(), fetchFn as any);

    await svc.sendAlert('500 GET /api/v1/x', 'boom', { ip: '1.2.3.4' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://example.com/webhook');
    const body = JSON.parse(init.body);
    expect(body.msgtype).toBe('text');
    expect(body.text.content).toContain('500 GET /api/v1/x');
    expect(body.text.content).toContain('1.2.3.4');
  });

  it('飞书类型使用 feishu 格式', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true });
    const svc = new AlertWebhookService(makeConfig({ ALERT_WEBHOOK_TYPE: 'feishu' }), fetchFn as any);

    await svc.sendAlert('t', 'm');

    const [, init] = fetchFn.mock.calls[0];
    expect(JSON.parse(init.body).msg_type).toBe('text');
  });

  it('Slack 类型使用纯文本', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true });
    const svc = new AlertWebhookService(makeConfig({ ALERT_WEBHOOK_TYPE: 'slack' }), fetchFn as any);

    await svc.sendAlert('t', 'm');

    const [, init] = fetchFn.mock.calls[0];
    expect(typeof JSON.parse(init.body).text).toBe('string');
  });

  it('防抖：间隔内只发一条', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true });
    const svc = new AlertWebhookService(
      makeConfig({ ALERT_WEBHOOK_MIN_INTERVAL_SECONDS: 60 }),
      fetchFn as any,
    );

    await svc.sendAlert('a', '1');
    await svc.sendAlert('b', '2');
    await svc.sendAlert('c', '3');

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('发送失败时静默记录不抛错', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('network'));
    const svc = new AlertWebhookService(makeConfig(), fetchFn as any);

    await expect(svc.sendAlert('t', 'm')).resolves.toBeUndefined();
  });
});
