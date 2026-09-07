// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { NoopPushService } from './noop-push.service';
import { PushPayload } from './push.service';

describe('NoopPushService（推送未配置时的降级 no-op）', () => {
  let service: NoopPushService;
  let logSpy: jest.SpyInstance;

  const payload: PushPayload = {
    title: '事件提醒',
    body: '你有 1 条新提醒',
    data: { route: '/events' },
  };

  beforeEach(() => {
    service = new NoopPushService();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('sendToDevice：返回 Promise<void>（resolve undefined）不抛错', async () => {
    await expect(
      service.sendToDevice('device-reg-id-123456789', payload),
    ).resolves.toBeUndefined();
  });

  it('sendToDevice：记录跳过日志，含脱敏 token 前缀与标题', async () => {
    await service.sendToDevice('abc12345-device-token', payload);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [msg] = logSpy.mock.calls[0] as [string];
    expect(msg).toContain('[Push] disabled');
    expect(msg).toContain('abc12345...');
    expect(msg).toContain(payload.title);
  });

  it('sendToTopic：返回 Promise<void>（resolve undefined）不抛错', async () => {
    await expect(
      service.sendToTopic('all-users', payload),
    ).resolves.toBeUndefined();
  });

  it('sendToTopic：记录跳过日志，含 topic 与标题', async () => {
    await service.sendToTopic('ops-alerts', payload);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [msg] = logSpy.mock.calls[0] as [string];
    expect(msg).toContain('ops-alerts');
    expect(msg).toContain(payload.title);
  });
});
