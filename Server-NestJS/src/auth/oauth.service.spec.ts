// SPDX-License-Identifier: Apache-2.0

import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { OAuthService } from './oauth.service';

describe('OAuthService', () => {
  let service: OAuthService;
  let fetchMock: jest.Mock;
  const realFetch = global.fetch;
  const configValues: Record<string, string> = {};

  const config = {
    get: jest.fn((key: string, def?: string) => configValues[key] ?? def),
  };

  const now = () => Math.floor(Date.now() / 1000);

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new OAuthService(config as any, {} as any);
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  describe('verify 分发', () => {
    it('google → verifyGoogle', async () => {
      const spy = jest.spyOn(service as any, 'verifyGoogle').mockResolvedValue({ providerId: 'g1' });
      await expect(service.verify('google', 'tok')).resolves.toEqual({ providerId: 'g1' });
      expect(spy).toHaveBeenCalledWith('tok', undefined);
    });

    it('apple → verifyApple', async () => {
      const spy = jest.spyOn(service as any, 'verifyApple').mockResolvedValue({ providerId: 'a1' });
      await expect(service.verify('apple', 'tok')).resolves.toEqual({ providerId: 'a1' });
      expect(spy).toHaveBeenCalledWith('tok', undefined);
    });

    it('未知 provider 抛 UnauthorizedException', async () => {
      await expect(service.verify('wechat', 'tok')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyCode 分发', () => {
    it('wechat → verifyWeChat', async () => {
      const spy = jest.spyOn(service as any, 'verifyWeChat').mockResolvedValue({ providerId: 'w1' });
      await expect(service.verifyCode('wechat', 'code')).resolves.toEqual({ providerId: 'w1' });
      expect(spy).toHaveBeenCalledWith('code', undefined, undefined);
    });

    it('alipay → verifyAlipay', async () => {
      const spy = jest.spyOn(service as any, 'verifyAlipay').mockResolvedValue({ providerId: 'p1' });
      await expect(service.verifyCode('alipay', 'code')).resolves.toEqual({ providerId: 'p1' });
      expect(spy).toHaveBeenCalledWith('code');
    });

    it('未知 provider 抛 UnauthorizedException', async () => {
      await expect(service.verifyCode('qq', 'code')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyGoogle', () => {
    const payload = {
      sub: 'g-123', email: 'user@gmail.com', email_verified: true,
      name: 'Zhang San', given_name: 'Zhang', family_name: 'San',
      picture: 'http://pic/1.png', aud: 'my-client', iss: 'accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    function mockGoogleResponse(p: Record<string, unknown>) {
      fetchMock.mockResolvedValue({ ok: true, json: async () => p });
    }

    it('校验成功返回用户信息', async () => {
      mockGoogleResponse(payload);
      await expect(service.verify('google', 'tok', 'my-client')).resolves.toEqual({
        providerId: 'g-123',
        email: 'user@gmail.com',
        name: 'Zhang San',
        avatarUrl: 'http://pic/1.png',
      });
    });

    it('无 name 时拼接 given/family，未验证邮箱返回 null', async () => {
      mockGoogleResponse({ ...payload, name: undefined, email_verified: false });
      const result = await service.verify('google', 'tok', 'my-client');
      expect(result.name).toBe('Zhang San');
      expect(result.email).toBeNull();
    });

    it('网络错误抛 UnauthorizedException', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      await expect(service.verify('google', 'tok')).rejects.toThrow('Failed to verify Google token');
    });

    it('HTTP 非 2xx 抛 UnauthorizedException', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401 });
      await expect(service.verify('google', 'tok')).rejects.toThrow('Invalid Google token');
    });

    it('audience 不匹配抛 UnauthorizedException', async () => {
      mockGoogleResponse({ ...payload, aud: 'other-client' });
      await expect(service.verify('google', 'tok', 'my-client')).rejects.toThrow('audience mismatch');
    });

    it('issuer 非法抛 UnauthorizedException', async () => {
      mockGoogleResponse({ ...payload, iss: 'evil.com' });
      await expect(service.verify('google', 'tok', 'my-client')).rejects.toThrow('issuer');
    });

    it('token 过期抛 UnauthorizedException', async () => {
      mockGoogleResponse({ ...payload, exp: now() - 3600 });
      await expect(service.verify('google', 'tok', 'my-client')).rejects.toThrow('expired');
    });

    it('未传 clientId 时读配置 GOOGLE_CLIENT_ID', async () => {
      configValues['GOOGLE_CLIENT_ID'] = 'cfg-client';
      mockGoogleResponse({ ...payload, aud: 'cfg-client' });
      await expect(service.verify('google', 'tok')).resolves.toMatchObject({ providerId: 'g-123' });
      delete configValues['GOOGLE_CLIENT_ID'];
    });
  });

  describe('verifyApple', () => {
    it('JWT 格式非法抛 UnauthorizedException', async () => {
      await expect(service.verify('apple', 'not-a-jwt', 'cid')).rejects.toThrow('Invalid Apple token format');
    });

    it('缺 kid 抛 UnauthorizedException', async () => {
      const token = `${Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')}.x.x`;
      await expect(service.verify('apple', token, 'cid')).rejects.toThrow('missing key ID');
    });

    it('JWKS 中找不到对应 kid 抛 UnauthorizedException', async () => {
      const token = `${Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'nope' })).toString('base64url')}.x.x`;
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ keys: [] }) });
      await expect(service.verify('apple', token, 'cid')).rejects.toThrow('key not found');
    });

    describe('RSA 签名', () => {
      let kid: string;
      let privateKey: string;
      let jwk: crypto.JsonWebKey;

      beforeAll(() => {
        const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
        privateKey = pair.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
        jwk = pair.publicKey.export({ format: 'jwk' });
        kid = 'rsa-test-kid';
      });

      function jwksResponse() {
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ keys: [{ kty: 'RSA', kid, alg: 'RS256', n: jwk.n, e: jwk.e }] }),
        });
      }

      it('RSA 签名校验成功返回用户信息', async () => {
        configValues['APPLE_CLIENT_ID'] = 'apple-cid';
        jwksResponse();
        const token = jwt.sign(
          { sub: 'apple-rsa', email: 'a@b.com', email_verified: true, aud: 'apple-cid' },
          privateKey,
          { algorithm: 'RS256', issuer: 'https://appleid.apple.com', keyid: kid, expiresIn: '1h' },
        );
        await expect(service.verify('apple', token)).resolves.toEqual({
          providerId: 'apple-rsa',
          email: 'a@b.com',
          name: null,
          avatarUrl: null,
        });
      });

      it('email 未验证返回 null', async () => {
        configValues['APPLE_CLIENT_ID'] = 'apple-cid';
        jwksResponse();
        const token = jwt.sign(
          { sub: 'apple-rsa', email: 'a@b.com', email_verified: false, aud: 'apple-cid' },
          privateKey,
          { algorithm: 'RS256', issuer: 'https://appleid.apple.com', keyid: kid, expiresIn: '1h' },
        );
        await expect(service.verify('apple', token)).resolves.toEqual({
          providerId: 'apple-rsa', email: null, name: null, avatarUrl: null,
        });
      });

      it('签名非法抛 UnauthorizedException', async () => {
        jwksResponse();
        const token = jwt.sign(
          { sub: 'evil', email_verified: true },
          crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }) as string,
          { algorithm: 'RS256', issuer: 'https://appleid.apple.com', keyid: kid, expiresIn: '1h' },
        );
        await expect(service.verify('apple', token, 'apple-cid')).rejects.toThrow('Invalid Apple token');
      });
    });

    describe('EC 签名', () => {
      it('EC (P-256) 签名校验成功', async () => {
        const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
        const privateKey = pair.privateKey.export({ type: 'sec1', format: 'pem' }) as string;
        const jwk = pair.publicKey.export({ format: 'jwk' }) as crypto.JsonWebKey & { x: string; y: string };
        const kid = 'ec-test-kid';
        configValues['APPLE_CLIENT_ID'] = 'apple-cid';
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ keys: [{ kty: 'EC', kid, alg: 'ES256', crv: 'P-256', x: jwk.x, y: jwk.y }] }),
        });
        const token = jwt.sign(
          { sub: 'apple-ec', email_verified: true, aud: 'apple-cid' },
          privateKey,
          { algorithm: 'ES256', issuer: 'https://appleid.apple.com', keyid: kid, expiresIn: '1h' },
        );
        await expect(service.verify('apple', token, 'apple-cid')).resolves.toMatchObject({ providerId: 'apple-ec' });
      });
    });

    it('JWKS 拉取失败且无缓存抛 UnauthorizedException', async () => {
      fetchMock.mockRejectedValue(new Error('network'));
      const token = `${Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k' })).toString('base64url')}.x.x`;
      await expect(service.verify('apple', token, 'cid')).rejects.toThrow('Failed to verify Apple token');
    });

    it('JWKS 缓存命中不重复请求', async () => {
      const kid = 'cached-kid';
      const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const privateKey = pair.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
      const jwk = pair.publicKey.export({ format: 'jwk' });
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ keys: [{ kty: 'RSA', kid, alg: 'RS256', n: jwk.n, e: jwk.e }] }),
      });
      configValues['APPLE_CLIENT_ID'] = 'apple-cid';
      const token = jwt.sign(
        { sub: 'cached', email_verified: true, aud: 'apple-cid' },
        privateKey,
        { algorithm: 'RS256', issuer: 'https://appleid.apple.com', keyid: kid, expiresIn: '1h' },
      );
      await service.verify('apple', token, 'apple-cid');
      await service.verify('apple', token, 'apple-cid');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('JWKS 拉取失败但缓存存在时回退缓存', async () => {
      // 先成功填充缓存
      const kid = 'fb-kid';
      const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const privateKey = pair.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
      const jwk = pair.publicKey.export({ format: 'jwk' });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keys: [{ kty: 'RSA', kid, alg: 'RS256', n: jwk.n, e: jwk.e }] }),
      });
      configValues['APPLE_CLIENT_ID'] = 'apple-cid';
      const token = jwt.sign(
        { sub: 'fb', email_verified: true, aud: 'apple-cid' },
        privateKey,
        { algorithm: 'RS256', issuer: 'https://appleid.apple.com', keyid: kid, expiresIn: '1h' },
      );
      await service.verify('apple', token, 'apple-cid');
      // 使缓存过期后再次失败
      (service as any).appleJwksCache.fetchedAt = 0;
      fetchMock.mockRejectedValueOnce(new Error('network'));
      await expect(service.verify('apple', token, 'apple-cid')).resolves.toMatchObject({ providerId: 'fb' });
    });
  });

  describe('verifyWeChat', () => {
    const baseConfig = () => { configValues['WECHAT_APP_ID'] = 'wx-app'; configValues['WECHAT_APP_SECRET'] = 'secret'; };

    afterEach(() => { delete configValues['WECHAT_APP_ID']; delete configValues['WECHAT_APP_SECRET']; });

    it('未配置抛 UnauthorizedException', async () => {
      await expect(service.verifyCode('wechat', 'code')).rejects.toThrow('not configured');
    });

    it('token 交换网络错误抛 UnauthorizedException', async () => {
      baseConfig();
      fetchMock.mockRejectedValue(new Error('network'));
      await expect(service.verifyCode('wechat', 'code')).rejects.toThrow('Failed to verify WeChat code');
    });

    it('token 返回错误码抛 UnauthorizedException', async () => {
      baseConfig();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ errcode: 40029, errmsg: 'invalid code' }) });
      await expect(service.verifyCode('wechat', 'code')).rejects.toThrow('Invalid WeChat authorization code');
    });

    it('token 无 openid 抛 UnauthorizedException', async () => {
      baseConfig();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ access_token: 'tok' }) });
      await expect(service.verifyCode('wechat', 'code')).rejects.toThrow('Invalid WeChat authorization code');
    });

    it('校验成功返回用户信息（带 redirectUri 透传）', async () => {
      baseConfig();
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'at', openid: 'open-1', unionid: 'union-1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ openid: 'open-1', nickname: '小明', headimgurl: 'http://h' }) });
      await expect(service.verifyCode('wechat', 'code', 'https://app/callback')).resolves.toEqual({
        providerId: 'union-1', email: null, name: '小明', avatarUrl: 'http://h',
      });
      const tokenUrl = String(fetchMock.mock.calls[0][0]);
      expect(tokenUrl).toContain('redirect_uri=');
      expect(tokenUrl).toContain(encodeURIComponent('https://app/callback'));
    });

    it('无 unionid 时用 openid 作为 providerId', async () => {
      baseConfig();
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'at', openid: 'open-only' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ openid: 'open-only', nickname: 'X' }) });
      await expect(service.verifyCode('wechat', 'code')).resolves.toEqual({
        providerId: 'open-only', email: null, name: 'X', avatarUrl: null,
      });
    });

    it('userinfo 网络错误回退 openid', async () => {
      baseConfig();
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'at', openid: 'o1', unionid: 'u1' }) })
        .mockRejectedValueOnce(new Error('network'));
      await expect(service.verifyCode('wechat', 'code')).resolves.toEqual({
        providerId: 'u1', email: null, name: null, avatarUrl: null,
      });
    });

    it('userinfo 返回错误码回退 openid', async () => {
      baseConfig();
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'at', openid: 'o1', unionid: 'u1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ errcode: 40003, errmsg: 'invalid openid' }) });
      await expect(service.verifyCode('wechat', 'code')).resolves.toEqual({
        providerId: 'u1', email: null, name: null, avatarUrl: null,
      });
    });

    // MINI-3：小程序 code2Session
    it('miniapp 走 jscode2session 返回 openid（providerId=openid）', async () => {
      baseConfig();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ openid: 'mini-open-1', session_key: 'sk', unionid: 'union-1' }) });
      await expect(service.verifyCode('wechat', 'code', undefined, 'miniapp')).resolves.toEqual({
        providerId: 'mini-open-1', email: null, name: null, avatarUrl: null,
      });
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain('jscode2session');
      expect(url).toContain('js_code=');
    });

    it('miniapp code2Session 网络错误抛', async () => {
      baseConfig();
      fetchMock.mockRejectedValue(new Error('network'));
      await expect(service.verifyCode('wechat', 'code', undefined, 'miniapp')).rejects.toThrow('Failed to verify WeChat mini-app code');
    });

    it('miniapp code2Session 错误码抛', async () => {
      baseConfig();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ errcode: 40029, errmsg: 'invalid code' }) });
      await expect(service.verifyCode('wechat', 'code', undefined, 'miniapp')).rejects.toThrow('Invalid WeChat mini-app code');
    });

    it('miniapp 无 openid 抛', async () => {
      baseConfig();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ session_key: 'sk' }) });
      await expect(service.verifyCode('wechat', 'code', undefined, 'miniapp')).rejects.toThrow('Invalid WeChat mini-app code');
    });
  });

  describe('verifyAlipay', () => {
    let rsaPrivate: string;
    let rsaPublic: string;

    beforeAll(() => {
      const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      rsaPrivate = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      rsaPublic = pair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
    });

    const appConfig = () => {
      configValues['ALIPAY_APP_ID'] = 'alipay-app';
      configValues['ALIPAY_PRIVATE_KEY'] = rsaPrivate;
    };

    afterEach(() => { delete configValues['ALIPAY_APP_ID']; delete configValues['ALIPAY_PRIVATE_KEY']; delete configValues['ALIPAY_PUBLIC_KEY']; });

    function mockAlipayResponse(responseKey: string, body: Record<string, unknown>) {
      fetchMock.mockResolvedValue({ ok: true, text: async () => JSON.stringify({ [responseKey]: body }) });
    }

    it('未配置 appId 抛 UnauthorizedException', async () => {
      await expect(service.verifyCode('alipay', 'code')).rejects.toThrow('not configured');
    });

    it('签名失败（无私钥）抛 UnauthorizedException', async () => {
      configValues['ALIPAY_APP_ID'] = 'alipay-app';
      await expect(service.verifyCode('alipay', 'code')).rejects.toThrow('Invalid Alipay authorization code');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('token 交换返回错误码抛 UnauthorizedException', async () => {
      appConfig();
      mockAlipayResponse('alipay_system_oauth_token_response', { code: '40002', sub_msg: 'invalid code' });
      await expect(service.verifyCode('alipay', 'code')).rejects.toThrow('Invalid Alipay authorization code');
    });

    it('token 交换网络错误抛 UnauthorizedException', async () => {
      appConfig();
      fetchMock.mockRejectedValue(new Error('network'));
      await expect(service.verifyCode('alipay', 'code')).rejects.toThrow('Invalid Alipay authorization code');
    });

    it('无 userId 抛 UnauthorizedException', async () => {
      appConfig();
      mockAlipayResponse('alipay_system_oauth_token_response', { code: '10000' });
      await expect(service.verifyCode('alipay', 'code')).rejects.toThrow('Invalid Alipay authorization code');
    });

    it('校验成功返回用户信息（含 userinfo 第二步）', async () => {
      appConfig();
      fetchMock
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ alipay_system_oauth_token_response: { user_id: 'u1', code: '10000' } }) })
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ alipay_user_info_share_response: { nick_name: '王五', avatar: 'http://a' } }) });
      await expect(service.verifyCode('alipay', 'code')).resolves.toEqual({
        providerId: 'u1', email: null, name: '王五', avatarUrl: 'http://a',
      });
    });

    it('私钥缺失但 token 交换成功时返回基础信息', async () => {
      configValues['ALIPAY_APP_ID'] = 'alipay-app';
      (service as any).alipayCall = jest.fn().mockResolvedValue({ user_id: 'u9' });
      await expect(service.verifyCode('alipay', 'code')).resolves.toEqual({
        providerId: 'u9', email: null, name: null, avatarUrl: null,
      });
    });

    it('响应带签名且验证通过（CR-14②）', async () => {
      appConfig();
      configValues['ALIPAY_PUBLIC_KEY'] = rsaPublic;
      const responseObj = { user_id: 'u2', code: '10000' };
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(JSON.stringify(responseObj), 'utf-8');
      const signature = signer.sign(rsaPrivate, 'base64');
      const rawText = `{"alipay_system_oauth_token_response":${JSON.stringify(responseObj)},"sign":"${signature}"}`;
      fetchMock.mockResolvedValue({ ok: true, text: async () => rawText });
      await expect(service.verifyCode('alipay', 'code')).resolves.toEqual({
        providerId: 'u2', email: null, name: null, avatarUrl: null,
      });
    });

    it('响应签名验证失败返回 null → 抛 UnauthorizedException', async () => {
      appConfig();
      configValues['ALIPAY_PUBLIC_KEY'] = rsaPublic;
      const otherPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const responseObj = { user_id: 'u3', code: '10000' };
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(JSON.stringify(responseObj), 'utf-8');
      const signature = signer.sign(otherPair.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string, 'base64');
      const rawText = `{"alipay_system_oauth_token_response":${JSON.stringify(responseObj)},"sign":"${signature}"}`;
      fetchMock.mockResolvedValue({ ok: true, text: async () => rawText });
      await expect(service.verifyCode('alipay', 'code')).rejects.toThrow('Invalid Alipay authorization code');
    });
  });

  describe('verifyOidc（P2-4 企业 SSO）', () => {
    const ISSUER = 'https://sso.example.com/realms/keelbase';
    const CLIENT_ID = 'keelbase-client';
    const CLIENT_SECRET = 'client-secret';

    let kid: string;
    let privateKey: string;
    let jwk: crypto.JsonWebKey;

    beforeAll(() => {
      const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
      jwk = pair.publicKey.export({ format: 'jwk' });
      kid = 'oidc-kid';
    });

    function configureOidc() {
      configValues['OIDC_ISSUER'] = ISSUER;
      configValues['OIDC_CLIENT_ID'] = CLIENT_ID;
      configValues['OIDC_CLIENT_SECRET'] = CLIENT_SECRET;
    }

    function signIdToken(payload: Record<string, unknown>, overrides: jwt.SignOptions = {}): string {
      return jwt.sign(
        { sub: 'sso-user-1', email: 'user@sso.example', email_verified: true, name: 'SSO User', ...payload },
        privateKey,
        { algorithm: 'RS256', keyid: kid, issuer: ISSUER, audience: CLIENT_ID, expiresIn: '1h', ...overrides },
      );
    }

    function mockDiscovery(overrides: Record<string, unknown> = {}) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          issuer: ISSUER,
          token_endpoint: 'https://sso.example.com/token',
          userinfo_endpoint: 'https://sso.example.com/userinfo',
          jwks_uri: 'https://sso.example.com/jwks',
          ...overrides,
        }),
      });
    }

    function mockJwks() {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ keys: [{ kty: 'RSA', kid, alg: 'RS256', n: jwk.n, e: jwk.e }] }) });
    }

    function mockToken(idToken?: string, accessToken = 'at-123') {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: idToken, access_token: accessToken }) });
    }

    afterEach(() => {
      for (const k of Object.keys(configValues)) delete configValues[k];
    });

    it('成功流程：发现 → token → id_token 验证 → userinfo → 返回用户', async () => {
      configureOidc();
      mockDiscovery();
      mockToken(signIdToken({}));
      mockJwks();
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ sub: 'sso-user-1', email: 'user@sso.example', name: 'SSO User', picture: 'http://pic' }) });

      const result = await service.verifyCode('oidc', 'auth-code', 'https://app/callback');

      expect(result).toEqual({ providerId: 'sso-user-1', email: 'user@sso.example', name: 'SSO User', avatarUrl: 'http://pic' });
      // token 交换带 redirect_uri 与 client 凭据
      const tokenCall = fetchMock.mock.calls[1];
      expect(tokenCall[0]).toBe('https://sso.example.com/token');
      expect(String(tokenCall[1].body)).toContain('redirect_uri=https%3A%2F%2Fapp%2Fcallback');
      expect(String(tokenCall[1].body)).toContain(`client_id=${CLIENT_ID}`);
    });

    it('未配置 OIDC → Unauthorized', async () => {
      await expect(service.verifyCode('oidc', 'code')).rejects.toThrow('not configured');
    });

    it('发现返回 issuer 与配置不一致 → Unauthorized（防混淆）', async () => {
      configureOidc();
      mockDiscovery({ issuer: 'https://evil.example.com' });
      await expect(service.verifyCode('oidc', 'code')).rejects.toThrow('issuer mismatch');
    });

    it('发现失败（网络/HTTP）→ Unauthorized', async () => {
      configureOidc();
      fetchMock.mockRejectedValueOnce(new Error('network'));
      await expect(service.verifyCode('oidc', 'code')).rejects.toThrow('Invalid OIDC configuration');
    });

    it('token 交换失败（无 id_token）→ Unauthorized', async () => {
      configureOidc();
      mockDiscovery();
      mockToken(undefined);
      await expect(service.verifyCode('oidc', 'code')).rejects.toThrow('Invalid OIDC authorization code');
    });

    it('id_token 签名非法 → Unauthorized', async () => {
      configureOidc();
      mockDiscovery();
      // 用另一把私钥签 id_token → JWKS 公钥验不过
      const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const forged = jwt.sign(
        { sub: 'x' },
        other.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
        { algorithm: 'RS256', keyid: kid, issuer: ISSUER, audience: CLIENT_ID, expiresIn: '1h' },
      );
      mockToken(forged);
      mockJwks();
      await expect(service.verifyCode('oidc', 'code')).rejects.toThrow('Invalid OIDC token');
    });

    it('id_token issuer 不匹配 → Unauthorized', async () => {
      configureOidc();
      mockDiscovery();
      mockToken(signIdToken({}, { issuer: 'https://wrong.example.com' }));
      mockJwks();
      await expect(service.verifyCode('oidc', 'code')).rejects.toThrow('Invalid OIDC token');
    });

    it('userinfo 失败降级用 id_token 声明', async () => {
      configureOidc();
      mockDiscovery();
      mockToken(signIdToken({}));
      mockJwks();
      fetchMock.mockRejectedValueOnce(new Error('userinfo down'));
      const result = await service.verifyCode('oidc', 'code');
      expect(result.providerId).toBe('sso-user-1');
      expect(result.email).toBe('user@sso.example');
      expect(result.name).toBe('SSO User');
    });

    it('无 email 时 email=null', async () => {
      configureOidc();
      mockDiscovery();
      mockToken(signIdToken({ email: undefined }));
      mockJwks();
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ sub: 'sso-user-1' }) });
      const result = await service.verifyCode('oidc', 'code');
      expect(result.email).toBeNull();
    });
  });

  describe('getOidcAuthorizationUrl（企业 SSO 授权 URL）', () => {
    const ISSUER = 'https://sso.example.com/realms/keelbase';
    const CLIENT_ID = 'keelbase-client';
    const REDIRECT = 'https://app.example.com/auth/oidc/callback';

    function configureOidc() {
      configValues['OIDC_ISSUER'] = ISSUER;
      configValues['OIDC_CLIENT_ID'] = CLIENT_ID;
    }

    function mockDiscovery(overrides: Record<string, unknown> = {}) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          issuer: ISSUER,
          authorization_endpoint: 'https://sso.example.com/realms/keelbase/protocol/openid-connect/auth',
          token_endpoint: 'https://sso.example.com/token',
          ...overrides,
        }),
      });
    }

    afterEach(() => {
      for (const k of Object.keys(configValues)) delete configValues[k];
    });

    it('返回授权 URL：authorization_endpoint + client_id/code/scope/redirect_uri/state', async () => {
      configureOidc();
      mockDiscovery();
      const url = await service.getOidcAuthorizationUrl(REDIRECT);
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe('https://sso.example.com/realms/keelbase/protocol/openid-connect/auth');
      expect(parsed.searchParams.get('client_id')).toBe(CLIENT_ID);
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('scope')).toBe('openid profile email');
      expect(parsed.searchParams.get('redirect_uri')).toBe(REDIRECT);
      expect(parsed.searchParams.get('state')).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('每次调用 state 不同（防 CSRF 随机化）', async () => {
      configureOidc();
      mockDiscovery();
      const a = new URL(await service.getOidcAuthorizationUrl(REDIRECT)).searchParams.get('state');
      mockDiscovery();
      const b = new URL(await service.getOidcAuthorizationUrl(REDIRECT)).searchParams.get('state');
      expect(a).not.toBe(b);
    });

    it('OIDC 未配置（缺 clientId）→ UnauthorizedException', async () => {
      configValues['OIDC_ISSUER'] = ISSUER; // 只配 issuer 缺 clientId
      await expect(service.getOidcAuthorizationUrl(REDIRECT)).rejects.toThrow('OIDC is not configured');
    });

    it('discovery 缺 authorization_endpoint → UnauthorizedException', async () => {
      configureOidc();
      mockDiscovery({ authorization_endpoint: undefined });
      await expect(service.getOidcAuthorizationUrl(REDIRECT)).rejects.toThrow('OIDC authorization endpoint not advertised');
    });

    it('discovery issuer 与配置不一致 → UnauthorizedException（防混淆）', async () => {
      configureOidc();
      mockDiscovery({ issuer: 'https://evil.example.com' });
      await expect(service.getOidcAuthorizationUrl(REDIRECT)).rejects.toThrow('OIDC issuer mismatch');
    });

    it('discovery 请求失败 → UnauthorizedException', async () => {
      configureOidc();
      fetchMock.mockRejectedValueOnce(new Error('network down'));
      await expect(service.getOidcAuthorizationUrl(REDIRECT)).rejects.toThrow('Invalid OIDC configuration');
    });
  });
});
