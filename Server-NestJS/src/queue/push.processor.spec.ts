// SPDX-License-Identifier: Apache-2.0

import { PushProcessor, PushJobData } from './push.processor';
import { PUSH_SERVICE } from '../push/push.service';
import { PushTokenService } from '../push/push-token.service';

describe('PushProcessor', () => {
  let processor: PushProcessor;
  const mockPush = { sendToDevice: jest.fn().mockResolvedValue(undefined), sendToTopic: jest.fn() };
  const mockTokenService = { getTokensForUser: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new PushProcessor(
      mockPush as any,
      mockTokenService as unknown as PushTokenService,
    );
  });

  it('pushes to all user tokens', async () => {
    mockTokenService.getTokensForUser.mockResolvedValue([{ token: 'a' }, { token: 'b' }]);

    await processor.process({ data: { userId: 1, title: 'T', body: 'B', type: 'system', link: '/x' } } as any);

    expect(mockPush.sendToDevice).toHaveBeenCalledTimes(2);
    expect(mockPush.sendToDevice).toHaveBeenCalledWith('a', expect.objectContaining({ title: 'T' }));
  });

  it('passes targetType/targetId into push payload data', async () => {
    mockTokenService.getTokensForUser.mockResolvedValue([{ token: 'a' }]);

    await processor.process({
      data: { userId: 1, title: 'T', type: 'reminder', link: '/events/5', targetType: 'event', targetId: '5' },
    } as any);

    expect(mockPush.sendToDevice).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({
        data: expect.objectContaining({ targetType: 'event', targetId: '5' }),
      }),
    );
  });

  it('skips when user has no tokens', async () => {
    mockTokenService.getTokensForUser.mockResolvedValue([]);

    await processor.process({ data: { userId: 1, title: 'T' } } as any);

    expect(mockPush.sendToDevice).not.toHaveBeenCalled();
  });

  it('swallows per-token send errors', async () => {
    mockTokenService.getTokensForUser.mockResolvedValue([{ token: 'a' }]);
    mockPush.sendToDevice.mockRejectedValue(new Error('jpush down'));

    await expect(
      processor.process({ data: { userId: 1, title: 'T' } } as any),
    ).resolves.toBeUndefined();
  });

  it('swallows getTokensForUser errors', async () => {
    mockTokenService.getTokensForUser.mockRejectedValue(new Error('db down'));

    await expect(
      processor.process({ data: { userId: 1, title: 'T' } } as any),
    ).resolves.toBeUndefined();
  });
});
