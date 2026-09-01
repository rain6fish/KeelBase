// SPDX-License-Identifier: Apache-2.0

import { ConsoleSmsProvider } from './console-sms.provider';

describe('ConsoleSmsProvider', () => {
  it('send 记录日志不抛错', async () => {
    const provider = new ConsoleSmsProvider();
    await expect(provider.send('13800000000', '验证码 123456')).resolves.toBeUndefined();
  });
});
