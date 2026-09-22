// SPDX-License-Identifier: Apache-2.0

/**
 * AU-3（§22.19 归因层）：访客标识的解析与签发单测。
 * 本仓原本不用 cookie，故解析是**手写的**——这类代码最容易在边界上出错，逐条钉住。
 */
import { GUEST_COOKIE, GUEST_ID_MAX_LENGTH, ensureGuestId, parseCookieHeader, readGuestId } from './guest-id';

const req = (headers: Record<string, unknown>) => ({ headers }) as never;

describe('parseCookieHeader（AU-3）', () => {
  it('从多 cookie 中取出指定键', () => {
    expect(parseCookieHeader('a=1; kb_guest=guest-abc; b=2')).toBe('guest-abc');
  });

  it('容忍「等号两侧有空格」与「无空格」两种写法', () => {
    expect(parseCookieHeader('kb_guest=x')).toBe('x');
    expect(parseCookieHeader('  kb_guest = y  ')).toBe('y');
  });

  it('URL 编码值解码', () => {
    expect(parseCookieHeader(`kb_guest=${encodeURIComponent('a b/c')}`)).toBe('a b/c');
  });

  it('缺键 / 空头 / 畸形段 → undefined（不抛）', () => {
    expect(parseCookieHeader(undefined)).toBeUndefined();
    expect(parseCookieHeader('')).toBeUndefined();
    expect(parseCookieHeader('other=1; more=2')).toBeUndefined();
    expect(parseCookieHeader('garbage; kb_guest=')).toBeUndefined();
  });

  it('同名取首个（不因重复而漂移）', () => {
    expect(parseCookieHeader('kb_guest=first; kb_guest=second')).toBe('first');
  });

  it('支持自定义键名', () => {
    expect(parseCookieHeader('x=9', 'x')).toBe('9');
  });
});

describe('readGuestId（cookie 优先，X-Guest-Id 兜底）', () => {
  it('cookie 优先于请求头', () => {
    expect(readGuestId(req({ cookie: 'kb_guest=from-cookie', 'x-guest-id': 'from-header' }))).toBe(
      'from-cookie',
    );
  });

  it('无 cookie 时用请求头（供 Flutter / Taro / 脚本等不走 cookie 的客户端）', () => {
    expect(readGuestId(req({ 'x-guest-id': 'from-header' }))).toBe('from-header');
  });

  it('请求头为数组取首个；纯空白视为无', () => {
    expect(readGuestId(req({ 'x-guest-id': ['a', 'b'] }))).toBe('a');
    expect(readGuestId(req({ 'x-guest-id': '   ' }))).toBeUndefined();
  });

  it('两者皆无 → undefined', () => {
    expect(readGuestId(req({}))).toBeUndefined();
  });

  // ── 列宽边界（回归：超过 varchar(64) 的值曾让操作审计静默丢行、AI 审计写入抛错）──

  it('超列宽候选值判为无效（不截断）→ undefined', () => {
    const tooLong = 'g'.repeat(GUEST_ID_MAX_LENGTH + 1);
    expect(readGuestId(req({ 'x-guest-id': tooLong }))).toBeUndefined();
    expect(readGuestId(req({ cookie: `kb_guest=${tooLong}` }))).toBeUndefined();
  });

  it('恰好等于列宽可用（闭区间边界）', () => {
    const exact = 'g'.repeat(GUEST_ID_MAX_LENGTH);
    expect(readGuestId(req({ 'x-guest-id': exact }))).toBe(exact);
  });
});

describe('ensureGuestId（无则签发并写 cookie）', () => {
  it('已有标识 → 原样返回，不重复签发', () => {
    const cookie = jest.fn();
    const id = ensureGuestId(req({ cookie: 'kb_guest=existing' }), { cookie } as never);
    expect(id).toBe('existing');
    expect(cookie).not.toHaveBeenCalled();
  });

  it('无标识 → 签发 UUID 并写 httpOnly cookie', () => {
    const cookie = jest.fn();
    const id = ensureGuestId(req({}), { cookie } as never);

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    // 列宽 varchar(64)：UUID 36 字符，留足余量
    expect(id.length).toBeLessThanOrEqual(64);
    expect(cookie).toHaveBeenCalledWith(
      GUEST_COOKIE,
      id,
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
  });

  it('两访客（两次调用）得到不同标识——否则归因仍会塌缩', () => {
    const a = ensureGuestId(req({}), { cookie: jest.fn() } as never);
    const b = ensureGuestId(req({}), { cookie: jest.fn() } as never);
    expect(a).not.toBe(b);
  });

  it('写 cookie 失败（响应头已发出）不抛，仍返回标识', () => {
    const cookie = jest.fn(() => {
      throw new Error('headers already sent');
    });
    expect(() => ensureGuestId(req({}), { cookie } as never)).not.toThrow();
  });

  it('超长候选值 → 视为无标识，签发新 UUID 并写 cookie（不透传落库）', () => {
    const cookie = jest.fn();
    const id = ensureGuestId(req({ 'x-guest-id': 'g'.repeat(200) }), { cookie } as never);

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(cookie).toHaveBeenCalled();
  });
});
