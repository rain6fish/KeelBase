// SPDX-License-Identifier: Apache-2.0

import { applyRequestContext, readDeviceId, requestContext } from './request-context';

/**
 * AU-2/AU-3: the attribution metadata every request carries. The device id is a *clue*, not a
 * credential — an unusable one must read as absent rather than be truncated into someone else's id.
 *
 * AU-2/AU-3：每个请求携带的归因元数据。设备标识是**线索**、不是凭证 —— 不可用的那个必须读作缺席，
 * 而不是被截断成别人的 id。
 */
describe('request context (AU-2 / AU-3)', () => {
  it('reads the device id header; a repeated header takes the first value', () => {
    expect(readDeviceId({ headers: { 'x-device-id': 'device-1' } } as never)).toBe('device-1');
    expect(readDeviceId({ headers: { 'x-device-id': ['device-1', 'device-2'] } } as never)).toBe('device-1');
  });

  it('absent, blank or over-wide reads as no id — never a truncated one', () => {
    expect(readDeviceId({ headers: {} } as never)).toBeUndefined();
    expect(readDeviceId({ headers: { 'x-device-id': '   ' } } as never)).toBeUndefined();
    // 65 characters: one past `device_id varchar(64)`. Truncating would fold two clients into one.
    // 65 个字符：比 `device_id varchar(64)` 多一个。截断会把两个客户端折成同一个 id。
    expect(readDeviceId({ headers: { 'x-device-id': 'x'.repeat(65) } } as never)).toBeUndefined();
    expect(readDeviceId({ headers: { 'x-device-id': 'x'.repeat(64) } } as never)).toHaveLength(64);
  });

  it('the middleware puts ip / guestId / deviceId on the store for the request', () => {
    let handler: ((req: unknown, res: unknown, next: () => void) => void) | undefined;
    const app = {
      use: (fn: (req: unknown, res: unknown, next: () => void) => void) => {
        handler = fn;
      },
    };

    applyRequestContext(app as never);
    expect(handler).toBeDefined();

    const req = { ip: '203.0.113.9', headers: { 'x-device-id': 'device-9' }, cookies: {} };
    const res = { cookie: jest.fn() };
    let store: unknown;
    handler?.(req, res, () => {
      store = requestContext.getStore();
    });

    expect(store).toMatchObject({ ip: '203.0.113.9', deviceId: 'device-9' });
    // The guest id is issued for this request (AU-3): a demo visitor is not the account holder.
    // 访客标识在本请求上被签发（AU-3）：演示访客不是账号本人。
    expect((store as { guestId?: string }).guestId).toEqual(expect.any(String));
  });
});
