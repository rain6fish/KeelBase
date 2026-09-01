// SPDX-License-Identifier: Apache-2.0

import { PushTokenController } from './push-token.controller';
import { PushTokenService } from './push-token.service';

describe('PushTokenController', () => {
  let controller: PushTokenController;
  let pushTokenService: Record<string, jest.Mock>;

  const mockUser = { sub: 7, username: 'alex' };

  beforeEach(() => {
    pushTokenService = {
      registerToken: jest.fn(),
      unregisterToken: jest.fn(),
    };
    controller = new PushTokenController(pushTokenService as unknown as PushTokenService);
  });

  it('register 委托 registerToken（携带 userId 与 DTO）', async () => {
    const dto = { deviceId: 'dev-1', platform: 'ios', token: 'abcdefgh' };
    const saved = { id: 1, userId: 7, ...dto };
    pushTokenService.registerToken.mockResolvedValue(saved);

    const result = await controller.register(dto as never, mockUser as never);

    expect(pushTokenService.registerToken).toHaveBeenCalledWith(7, dto);
    expect(result).toEqual(saved);
  });

  it('unregister 委托 unregisterToken 并返回 null', async () => {
    pushTokenService.unregisterToken.mockResolvedValue(undefined);

    const result = await controller.unregister('token-abc', mockUser as never);

    expect(pushTokenService.unregisterToken).toHaveBeenCalledWith(7, 'token-abc');
    expect(result).toBeNull();
  });
});
