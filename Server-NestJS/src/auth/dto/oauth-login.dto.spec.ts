import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OAuthLoginDto } from './oauth-login.dto';

describe('OAuthLoginDto', () => {
  it('provider 合法枚举通过；非法枚举失败', async () => {
    const ok = plainToInstance(OAuthLoginDto, { provider: 'wechat', authorizationCode: 'a'.repeat(8) });
    expect(await validate(ok)).toEqual([]);

    const bad = plainToInstance(OAuthLoginDto, { provider: 'facebook' });
    const errors = await validate(bad);
    expect(errors.some((e) => e.property === 'provider')).toBe(true);
  });

  it('google/apple 需要 ≥20 位 idToken（ValidateIf 启用约束）', async () => {
    const good = plainToInstance(OAuthLoginDto, { provider: 'google', idToken: 'a'.repeat(20) });
    expect(await validate(good)).toEqual([]);

    const short = plainToInstance(OAuthLoginDto, { provider: 'apple', idToken: 'short' });
    const errors = await validate(short);
    expect(errors.some((e) => e.property === 'idToken')).toBe(true);
  });

  it('wechat/alipay/oidc 需要 ≥8 位 authorizationCode', async () => {
    const good = plainToInstance(OAuthLoginDto, { provider: 'wechat', authorizationCode: 'a'.repeat(8) });
    expect(await validate(good)).toEqual([]);

    const short = plainToInstance(OAuthLoginDto, { provider: 'oidc', authorizationCode: 'x' });
    const errors = await validate(short);
    expect(errors.some((e) => e.property === 'authorizationCode')).toBe(true);
  });

  it('ValidateIf 排除：google 不需 authorizationCode，wechat 不需 idToken', async () => {
    const google = plainToInstance(OAuthLoginDto, { provider: 'google', idToken: 'a'.repeat(20) });
    expect(await validate(google)).toEqual([]);

    const wechat = plainToInstance(OAuthLoginDto, { provider: 'wechat', authorizationCode: 'a'.repeat(8) });
    expect(await validate(wechat)).toEqual([]);
  });

  it('可选字段 clientId/redirectUri/providerType', async () => {
    const dto = plainToInstance(OAuthLoginDto, {
      provider: 'wechat',
      authorizationCode: 'a'.repeat(8),
      clientId: 'cid-1',
      redirectUri: 'https://x.example/cb',
      providerType: 'miniapp',
    });
    expect(await validate(dto)).toEqual([]);

    // providerType 不在 web/miniapp 枚举内 → 失败
    const badType = plainToInstance(OAuthLoginDto, {
      provider: 'wechat',
      authorizationCode: 'a'.repeat(8),
      providerType: 'h5',
    });
    const errors = await validate(badType);
    expect(errors.some((e) => e.property === 'providerType')).toBe(true);
  });
});
