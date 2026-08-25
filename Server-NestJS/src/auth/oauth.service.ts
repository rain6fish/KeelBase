import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

import type { OAuthUserInfo } from './interfaces/oauth-user-info.interface';
import { OAuthProvidersConfigService } from './oauth-providers.config';

// ─── Type helpers ──────────────────────────────────────────────────────────

interface GoogleTokenInfo {
  sub: string; email?: string; email_verified?: boolean;
  name?: string; picture?: string; given_name?: string; family_name?: string;
  aud?: string; iss?: string; exp?: number;
}

interface JwkKey { kty: string; kid: string; alg: string; n?: string; e?: string; x?: string; y?: string; crv?: string; use?: string; }
interface AppleJwksResponse { keys: JwkKey[]; }

/** WeChat token exchange response. */
interface WeChatTokenRes {
  access_token?: string; expires_in?: number; refresh_token?: string;
  openid?: string; scope?: string; unionid?: string;
  errcode?: number; errmsg?: string;
}

/** WeChat userinfo response. */
interface WeChatUserRes {
  openid: string; nickname?: string; sex?: number; province?: string;
  city?: string; country?: string; headimgurl?: string; unionid?: string;
  errcode?: number; errmsg?: string;
}

/** Alipay system.oauth.token response. */
interface AlipayTokenRes {
  user_id?: string; access_token?: string; expires_in?: number;
  error_response?: { code?: string; msg?: string; sub_code?: string; sub_msg?: string; };
}

/** Alipay user.info.share response. */
interface AlipayUserRes {
  user_id?: string; avatar?: string; nick_name?: string;
  error_response?: { code?: string; msg?: string; };
}

/** OIDC discovery document（.well-known/openid-configuration 子集）。 */
interface OidcDiscoveryDoc {
  issuer?: string; authorization_endpoint?: string; token_endpoint?: string; userinfo_endpoint?: string; jwks_uri?: string;
}

/** OIDC token endpoint response. */
interface OidcTokenRes {
  id_token?: string; access_token?: string; error?: string;
}

/** OIDC userinfo response. */
interface OidcUserInfo {
  sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string;
}

// ─── Service ───────────────────────────────────────────────────────────────

/**
 * OAuth token verification service.
 *
 * Supports:
 *  - **International**: Google (token info endpoint), Apple (JWKS + jsonwebtoken)
 *  - **China**: WeChat (code→token→userinfo), Alipay (auth_code→user info)
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  // Apple JWKS cache
  private appleJwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null;
  private readonly APPLE_JWKS_TTL = 3600_000;
  private readonly APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

  // OIDC（P2-4 企业 SSO）JWKS 缓存 per jwks_uri
  private oidcJwksCache = new Map<string, { keys: JwkKey[]; fetchedAt: number }>();
  private readonly OIDC_JWKS_TTL = 3600_000;

  constructor(
    private configService: ConfigService,
    private providersConfig: OAuthProvidersConfigService,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Verify an OAuth provider's **idToken** (Google / Apple).
   */
  async verify(provider: string, idToken: string, clientId?: string): Promise<OAuthUserInfo> {
    switch (provider) {
      case 'google': return this.verifyGoogle(idToken, clientId);
      case 'apple':  return this.verifyApple(idToken, clientId);
      default:
        throw new UnauthorizedException(`Provider ${provider} does not support idToken verification`);
    }
  }

  /**
   * Verify a provider's **authorization code** (WeChat / Alipay / QQ).
   */
  async verifyCode(provider: string, code: string, redirectUri?: string, providerType?: 'web' | 'miniapp'): Promise<OAuthUserInfo> {
    switch (provider) {
      case 'wechat': return this.verifyWeChat(code, redirectUri, providerType);
      case 'alipay': return this.verifyAlipay(code);
      case 'oidc': return this.verifyOidc(code, redirectUri);
      default:
        throw new UnauthorizedException(`Provider ${provider} does not support authorization code flow`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GOOGLE
  // ═══════════════════════════════════════════════════════════════════════════

  private async verifyGoogle(idToken: string, clientId?: string): Promise<OAuthUserInfo> {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    let response: Response;
    try { response = await fetch(url); } catch (err) {
      this.logger.error(`Google token info request failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Failed to verify Google token');
    }
    if (!response.ok) {
      this.logger.warn(`Google token rejected: ${response.status}`);
      throw new UnauthorizedException('Invalid Google token');
    }
    const payload: GoogleTokenInfo = await response.json();
    const expectedAud = clientId ?? this.configService.get<string>('GOOGLE_CLIENT_ID', '');
    if (expectedAud && payload.aud !== expectedAud) {
      throw new UnauthorizedException('Google token audience mismatch');
    }
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!payload.iss || !validIssuers.some((i) => payload.iss!.includes(i))) {
      throw new UnauthorizedException('Invalid Google token issuer');
    }
    // CR-14①：校验 id_token 过期（防重放）
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Google token expired');
    }
    const name = payload.name || [payload.given_name, payload.family_name].filter(Boolean).join(' ') || null;
    return { providerId: payload.sub, email: (payload.email && payload.email_verified) ? payload.email : null, name, avatarUrl: payload.picture ?? null };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  APPLE
  // ═══════════════════════════════════════════════════════════════════════════

  private async verifyApple(idToken: string, clientId?: string): Promise<OAuthUserInfo> {
    let header: Record<string, string>;
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT format');
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
    } catch { throw new UnauthorizedException('Invalid Apple token format'); }
    const kid = header.kid;
    if (!kid) throw new UnauthorizedException('Apple token missing key ID');
    const jwks = await this.getAppleJwks();
    const matchingKey = jwks.keys.find((k) => k.kid === kid);
    if (!matchingKey) throw new UnauthorizedException('Apple token key not found');
    const publicKeyPem = this.jwkToPem(matchingKey);
    let decoded: any;
    try {
      decoded = jwt.verify(idToken, publicKeyPem, {
        algorithms: [matchingKey.alg as jwt.Algorithm],
        issuer: 'https://appleid.apple.com',
        audience: clientId ?? this.configService.get<string>('APPLE_CLIENT_ID', ''),
      });
    } catch (err) {
      this.logger.warn(`Apple token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid Apple token');
    }
    const payload = decoded as Record<string, any>;
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    return { providerId: payload.sub, email: (payload.email && emailVerified) ? payload.email : null, name: null, avatarUrl: null };
  }

  private async getAppleJwks(): Promise<AppleJwksResponse> {
    const now = Date.now();
    if (this.appleJwksCache && now - this.appleJwksCache.fetchedAt < this.APPLE_JWKS_TTL) return this.appleJwksCache;
    try {
      const res = await fetch(this.APPLE_KEYS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AppleJwksResponse = await res.json();
      this.appleJwksCache = { keys: data.keys, fetchedAt: now };
      return data;
    } catch (err) {
      this.logger.error(`Failed to fetch Apple JWKS: ${(err as Error).message}`);
      if (this.appleJwksCache) return this.appleJwksCache;
      throw new UnauthorizedException('Failed to verify Apple token');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  WECHAT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * WeChat authorization code verification.
   *
   * Flow:
   *  1. Exchange code → access_token + openid
   *     GET https://api.weixin.qq.com/sns/oauth2/access_token
   *  2. Get user profile
   *     GET https://api.weixin.qq.com/sns/userinfo
   *
   * WeChat returns `unionid` only if the WeChat account is bound to
   * WeChat Open Platform. If unavailable, `openid` is used as providerId.
   *
   * @see https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html
   */
  private async verifyWeChat(code: string, redirectUri?: string, providerType: 'web' | 'miniapp' = 'web'): Promise<OAuthUserInfo> {
    const appId = this.configService.get<string>('WECHAT_APP_ID', '');
    const secret = this.configService.get<string>('WECHAT_APP_SECRET', '');
    if (!appId || !secret) {
      throw new UnauthorizedException('WeChat OAuth is not configured on the server');
    }

    // MINI-3：小程序登录走 jscode2session（Taro.login 的 code → openid + session_key）。
    // 订阅消息 touser 需小程序 openid，故 providerId 存 openid（公众号流程存 unionid，同人两渠道会分账号，unionid 合并二期）。
    if (providerType === 'miniapp') {
      return this.verifyWeChatMiniApp(code, appId, secret);
    }

    // Step 1: Exchange code for access_token
    // CR-14③：code 交换带上 redirect_uri（微信要求一致，防 code 劫持）
    const redirectParam = redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : '';
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${secret}&code=${code}&grant_type=authorization_code${redirectParam}`;
    let tokenRes: WeChatTokenRes;
    try {
      const res = await fetch(tokenUrl);
      tokenRes = await res.json();
    } catch (err) {
      this.logger.error(`WeChat token exchange failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Failed to verify WeChat code');
    }

    if (tokenRes.errcode || !tokenRes.openid) {
      this.logger.warn(`WeChat token error: ${tokenRes.errcode} ${tokenRes.errmsg}`);
      throw new UnauthorizedException('Invalid WeChat authorization code');
    }

    const openid = tokenRes.openid;
    const unionid = tokenRes.unionid ?? openid;
    const accessToken = tokenRes.access_token!;

    // Step 2: Get user profile
    const userUrl = `https://api.weixin.qq.com/sns/userinfo?access_token=${accessToken}&openid=${openid}`;
    let userRes: WeChatUserRes;
    try {
      const res = await fetch(userUrl);
      userRes = await res.json();
    } catch (err) {
      this.logger.error(`WeChat userinfo failed: ${(err as Error).message}`);
      // Fall back to just openid
      return {
        providerId: unionid,
        email: null,
        name: null,
        avatarUrl: null,
      };
    }

    if (userRes.errcode) {
      this.logger.warn(`WeChat userinfo error: ${userRes.errcode} ${userRes.errmsg}`);
      return { providerId: unionid, email: null, name: null, avatarUrl: null };
    }

    return {
      providerId: unionid,
      email: null,  // WeChat does not provide email
      name: userRes.nickname ?? null,
      avatarUrl: userRes.headimgurl ?? null,
    };
  }

  /** MINI-3：小程序 code2Session —— Taro.login 的 js_code 换 openid + session_key（无 userinfo，昵称/头像需后续完善资料）。 */
  private async verifyWeChatMiniApp(code: string, appId: string, secret: string): Promise<OAuthUserInfo> {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    let res: { openid?: string; session_key?: string; unionid?: string; errcode?: number; errmsg?: string };
    try {
      const r = await fetch(url);
      res = await r.json();
    } catch (err) {
      this.logger.error(`WeChat mini-app code2Session failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Failed to verify WeChat mini-app code');
    }
    if (res.errcode || !res.openid) {
      this.logger.warn(`WeChat mini-app code2Session error: ${res.errcode} ${res.errmsg}`);
      throw new UnauthorizedException('Invalid WeChat mini-app code');
    }
    // 订阅消息 touser 需小程序 openid（公众号/小程序同人分开，unionid 合并二期）
    return { providerId: res.openid, email: null, name: null, avatarUrl: null };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ALIPAY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Alipay authorization code verification.
   *
   * Flow:
   *  1. Exchange auth_code → access_token + user_id
   *     POST https://openapi.alipay.com/gateway.do (alipay.system.oauth.token)
   *  2. Get user profile
   *     POST https://openapi.alipay.com/gateway.do (alipay.user.info.share)
   *
   * Note: Alipay requires RSA2 signature for API calls. This implementation
   * uses the `crypto` module for signing.
   *
   * @see https://opendocs.alipay.com/open/01emuq
   */
  private async verifyAlipay(code: string): Promise<OAuthUserInfo> {
    const appId = this.configService.get<string>('ALIPAY_APP_ID', '');
    const privateKey = this.configService.get<string>('ALIPAY_PRIVATE_KEY', '');
    if (!appId) {
      throw new UnauthorizedException('Alipay OAuth is not configured on the server');
    }

    // Step 1: Exchange auth_code for user_id
    const tokenData = await this.alipayCall(
      'alipay.system.oauth.token',
      { grant_type: 'authorization_code', code },
      appId,
      privateKey,
    );

    const userId = tokenData?.user_id;
    if (!userId) {
      this.logger.warn(`Alipay token exchange failed: ${JSON.stringify(tokenData)}`);
      throw new UnauthorizedException('Invalid Alipay authorization code');
    }

    // Step 2: Get user profile (only if private key is configured)
    if (!privateKey) {
      return { providerId: userId, email: null, name: null, avatarUrl: null };
    }

    const userData = await this.alipayCall(
      'alipay.user.info.share',
      {},
      appId,
      privateKey,
      userId,
    );

    return {
      providerId: userId,
      email: null,
      name: userData?.nick_name ?? null,
      avatarUrl: userData?.avatar ?? null,
    };
  }

  /**
   * Make an Alipay OpenAPI call with RSA2 signature.
   *
   * This is a simplified implementation. A production app should use
   * the `alipay-sdk` npm package for full compatibility.
   */
  private async alipayCall(
    method: string,
    bizParams: Record<string, string>,
    appId: string,
    privateKey: string,
    userId?: string,
  ): Promise<Record<string, any> | null> {
    const publicKey = this.configService.get<string>('ALIPAY_PUBLIC_KEY', '');

    const params: Record<string, string> = {
      app_id: appId,
      method,
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '+08:00').replace('T', ' ').replace('Z', ''),
      version: '1.0',
      biz_content: JSON.stringify(bizParams),
    };

    if (userId) params.auth_token = userId;

    // Build the string to sign
    const sortedKeys = Object.keys(params).sort();
    const signStr = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');

    // Sign with RSA2 (SHA-256)
    try {
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(signStr, 'utf-8');
      const privateKeyPem = [
        '-----BEGIN PRIVATE KEY-----',
        ...this.chunkBase64(privateKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''), 64),
        '-----END PRIVATE KEY-----',
      ].join('\n');
      const signature = signer.sign(privateKeyPem, 'base64');
      params.sign = signature;
    } catch (err) {
      this.logger.error(`Alipay signing failed: ${(err as Error).message}`);
      return null;
    }

    // Build query string for GET (Alipay supports GET for public APIs)
    const queryStr = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    try {
      const res = await fetch(`https://openapi.alipay.com/gateway.do?${queryStr}`);
      const text = await res.text();
      const body = JSON.parse(text) as Record<string, any>;

      // Alipay wraps the response in a key named after the method + "_response"
      const responseKey = method.replace(/\./g, '_') + '_response';
      const responseBody = body[responseKey] ?? body;

      if (responseBody?.code && responseBody.code !== '10000') {
        this.logger.warn(`Alipay API error: ${responseBody.code} ${responseBody.sub_msg ?? responseBody.msg}`);
        return null;
      }

      // CR-14②：验证 Alipay 响应签名（RSA2，对原始响应 JSON 字符串验签；无公钥则跳过降级）
      if (publicKey && body.sign) {
        const ok = this.verifyAlipayResponseSign(text, responseKey, body.sign as string, publicKey);
        if (!ok) {
          this.logger.warn('Alipay response signature verification failed');
          return null;
        }
      }

      return responseBody;
    } catch (err) {
      this.logger.error(`Alipay API call failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  OIDC（P2-4 企业 SSO：授权码流程 + id_token 签名验证）
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 构建 OIDC authorization URL（企业 SSO 前端跳转 IdP 用）。
   * 动态发现 authorization_endpoint → 拼 client_id / response_type=code / scope / redirect_uri / 随机 state。
   * 仅 OIDC 已配置（issuer + clientId）可用，否则抛 401。
   */
  async getOidcAuthorizationUrl(redirectUri: string): Promise<string> {
    const issuer = this.configService.get<string>('OIDC_ISSUER', '');
    const clientId = this.configService.get<string>('OIDC_CLIENT_ID', '');
    if (!issuer || !clientId) {
      throw new UnauthorizedException('OIDC is not configured on the server');
    }
    const discovery = await this._discoverOidc(issuer);
    if (!discovery.authorization_endpoint) {
      throw new UnauthorizedException('OIDC authorization endpoint not advertised');
    }
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'openid profile email',
      redirect_uri: redirectUri,
      state: crypto.randomUUID(),
    });
    return `${discovery.authorization_endpoint}?${params.toString()}`;
  }

  /**
   * OIDC 动态发现（.well-known/openid-configuration）+ issuer 防混淆校验。
   * 供 getOidcAuthorizationUrl / verifyOidc 复用。
   */
  private async _discoverOidc(issuer: string): Promise<OidcDiscoveryDoc> {
    let discovery: OidcDiscoveryDoc;
    try {
      const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      discovery = await res.json();
    } catch (err) {
      this.logger.error(`OIDC discovery failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid OIDC configuration');
    }
    // 防混淆攻击：发现返回的 issuer 必须与配置一致
    if (!discovery.issuer || discovery.issuer.replace(/\/$/, '') !== issuer.replace(/\/$/, '')) {
      throw new UnauthorizedException('OIDC issuer mismatch');
    }
    return discovery;
  }

  /**
   * 通用 OIDC authorization code flow（企业 IdP，如 Keycloak / Azure AD）。
   *  1. 动态发现：GET {issuer}/.well-known/openid-configuration
   *  2. token 交换：POST token_endpoint（authorization_code）
   *  3. id_token 签名验证（issuer + audience + JWKS，安全硬门槛）
   *  4. userinfo：Bearer access_token → sub/email/name
   */
  private async verifyOidc(code: string, redirectUri?: string): Promise<OAuthUserInfo> {
    const issuer = this.configService.get<string>('OIDC_ISSUER', '');
    const clientId = this.configService.get<string>('OIDC_CLIENT_ID', '');
    const clientSecret = this.configService.get<string>('OIDC_CLIENT_SECRET', '');
    if (!issuer || !clientId || !clientSecret) {
      throw new UnauthorizedException('OIDC is not configured on the server');
    }

    // 1. 动态发现
    const discovery = await this._discoverOidc(issuer);
    const { token_endpoint: tokenEndpoint, userinfo_endpoint: userinfoEndpoint, jwks_uri: jwksUri } = discovery;
    if (!tokenEndpoint || !userinfoEndpoint || !jwksUri) {
      throw new UnauthorizedException('OIDC endpoints not advertised');
    }

    // 2. token 交换
    let tokenRes: OidcTokenRes;
    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
      });
      if (redirectUri) body.set('redirect_uri', redirectUri);
      const res = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      tokenRes = await res.json();
    } catch (err) {
      this.logger.error(`OIDC token exchange failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Failed to verify OIDC code');
    }
    if (!tokenRes.id_token) {
      this.logger.warn(`OIDC token exchange error: ${tokenRes.error ?? 'no id_token'}`);
      throw new UnauthorizedException('Invalid OIDC authorization code');
    }

    // 3. id_token 签名验证
    const idPayload = await this.verifyOidcIdToken(tokenRes.id_token, clientId, issuer, jwksUri);

    // 4. userinfo（失败降级用 id_token 声明）
    let userInfo: OidcUserInfo = {};
    if (tokenRes.access_token) {
      try {
        const res = await fetch(userinfoEndpoint, {
          headers: { Authorization: `Bearer ${tokenRes.access_token}` },
        });
        if (res.ok) userInfo = await res.json();
      } catch (err) {
        this.logger.warn(`OIDC userinfo failed: ${(err as Error).message}`);
      }
    }

    return {
      providerId: userInfo.sub ?? idPayload.sub,
      // userinfo 不可用时降级用 id_token 声明（OIDC id_token 通常也含 email/name）
      email: userInfo.email ?? idPayload.email ?? null,
      name: userInfo.name ?? idPayload.name ?? null,
      avatarUrl: userInfo.picture ?? idPayload.picture ?? null,
    };
  }

  private async verifyOidcIdToken(
    idToken: string,
    clientId: string,
    issuer: string,
    jwksUri: string,
  ): Promise<Record<string, any>> {
    let header: Record<string, string>;
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT format');
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
    } catch { throw new UnauthorizedException('Invalid OIDC token format'); }
    const kid = header.kid;
    if (!kid) throw new UnauthorizedException('OIDC token missing key ID');
    const jwks = await this.getOidcJwks(jwksUri);
    const matchingKey = jwks.keys.find((k) => k.kid === kid);
    if (!matchingKey) throw new UnauthorizedException('OIDC token key not found');
    const publicKeyPem = this.jwkToPem(matchingKey);
    try {
      const decoded = jwt.verify(idToken, publicKeyPem, {
        algorithms: [matchingKey.alg as jwt.Algorithm],
        issuer,
        audience: clientId,
      });
      return decoded as Record<string, any>;
    } catch (err) {
      this.logger.warn(`OIDC id_token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid OIDC token');
    }
  }

  private async getOidcJwks(jwksUri: string): Promise<{ keys: JwkKey[] }> {
    const cached = this.oidcJwksCache.get(jwksUri);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < this.OIDC_JWKS_TTL) return cached;
    try {
      const res = await fetch(jwksUri);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { keys: JwkKey[] };
      this.oidcJwksCache.set(jwksUri, { keys: data.keys, fetchedAt: now });
      return data;
    } catch (err) {
      this.logger.error(`Failed to fetch OIDC JWKS: ${(err as Error).message}`);
      if (cached) return cached;
      throw new UnauthorizedException('Failed to verify OIDC token');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /** CR-14②：验证 Alipay 响应签名——签名对象为响应中 {method}_response 的原始 JSON 字符串 */
  private verifyAlipayResponseSign(rawText: string, responseKey: string, sign: string, publicKey: string): boolean {
    try {
      const start = rawText.indexOf(`"${responseKey}"`);
      if (start < 0) return false;
      const braceIdx = rawText.indexOf('{', start);
      if (braceIdx < 0) return false;
      // 括号计数提取响应内容原始字符串（保留原始空白，Alipay 对这段原文做 RSA2 签名）
      let depth = 0;
      let end = braceIdx;
      for (let i = braceIdx; i < rawText.length; i++) {
        if (rawText[i] === '{') depth++;
        else if (rawText[i] === '}') {
          depth--;
          if (depth === 0) { end = i + 1; break; }
        }
      }
      const contentStr = rawText.slice(braceIdx, end);
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(contentStr, 'utf-8');
      return verifier.verify(this.formatAlipayKey(publicKey, 'PUBLIC KEY'), sign, 'base64');
    } catch {
      return false;
    }
  }

  private formatAlipayKey(key: string, label: 'PUBLIC KEY' | 'PRIVATE KEY'): string {
    const b64 = key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    const chunks = this.chunkBase64(b64, 64);
    return [`-----BEGIN ${label}-----`, ...chunks, `-----END ${label}-----`].join('\n');
  }
  private jwkToPem(jwk: JwkKey): string {
    if (jwk.kty === 'RSA') {
      const n = Buffer.from(jwk.n!, 'base64url');
      const e = Buffer.from(jwk.e!, 'base64url');
      // SPKI 需要 AlgorithmIdentifier（rsaEncryption OID + NULL）+ BIT STRING 包装，
      // 否则 createPublicKey 无法解析为非对称密钥
      const algoId = this.derSequence(Buffer.concat([
        Buffer.from('06092A864886F70D010101', 'hex'),
        Buffer.from('0500', 'hex'),
      ]));
      const rsaPub = this.derSequence(Buffer.concat([this.derInteger(n), this.derInteger(e)]));
      return this.toPem(this.derSequence(Buffer.concat([algoId, this.derBitString(rsaPub)])), 'PUBLIC KEY');
    }
    if (jwk.kty === 'EC') {
      const x = Buffer.from(jwk.x!, 'base64url');
      const y = Buffer.from(jwk.y!, 'base64url');
      const point = Buffer.concat([Buffer.from([0x04]), x, y]);
      const pointBitString = this.derBitString(point);
      const algoId = this.derSequence(Buffer.concat([
        Buffer.from('06072A8648CE3D0201', 'hex'),
        Buffer.from('06082A8648CE3D030107', 'hex'),
      ]));
      return this.toPem(this.derSequence(Buffer.concat([algoId, pointBitString])), 'PUBLIC KEY');
    }
    throw new Error(`Unsupported key type: ${jwk.kty}`);
  }

  private derInteger(v: Buffer): Buffer {
    let data = v; while (data.length > 1 && data[0] === 0) data = data.subarray(1);
    if (data[0]! & 0x80) data = Buffer.concat([Buffer.from([0x00]), data]);
    return Buffer.concat([Buffer.from([0x02]), this.derLength(data.length), data]);
  }
  private derBitString(v: Buffer): Buffer {
    return Buffer.concat([Buffer.from([0x03]), this.derLength(v.length + 1), Buffer.from([0x00]), v]);
  }
  private derSequence(contents: Buffer): Buffer {
    return Buffer.concat([Buffer.from([0x30]), this.derLength(contents.length), contents]);
  }
  private derLength(length: number): Buffer {
    if (length < 0x80) return Buffer.from([length]);
    const bytes: number[] = []; let len = length;
    while (len > 0) { bytes.unshift(len & 0xff); len >>= 8; }
    return Buffer.concat([Buffer.from([0x80 | bytes.length]), Buffer.from(bytes)]);
  }
  private toPem(der: Buffer, label: string): string {
    const b64 = der.toString('base64');
    const lines = [`-----BEGIN ${label}-----`];
    for (let i = 0; i < b64.length; i += 64) lines.push(b64.substring(i, i + 64));
    lines.push(`-----END ${label}-----`);
    return lines.join('\n');
  }
  private chunkBase64(str: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += size) chunks.push(str.substring(i, i + size));
    return chunks;
  }
}
