import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { OAuthProvidersConfigService } from './oauth-providers.config';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { DelegationTokenService } from './delegation-token.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Record<string, jest.Mock>;
  let oauthService: { getOidcAuthorizationUrl: jest.Mock };
  let providersConfig: { getConfig: jest.Mock };
  let caslFactory: { explain: jest.Mock };
  let delegationTokenService: { sign: jest.Mock };
  let aiService: { getAuthorizationChain: jest.Mock };
  let usersRepo: { findOne: jest.Mock };

  const mockUser = { sub: 1, username: 'alex' };
  const mockReq = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  } as any;

  beforeEach(() => {
    authService = Object.fromEntries(
      [
        'register', 'login', 'oAuthLogin', 'refreshToken', 'forgotPassword',
        'resetPassword', 'verifyEmail', 'resendVerification', 'sendSmsCode',
        'loginPhone', 'bindPhone', 'deactivateAccount', 'exportData',
        'getInviteInfo', 'getProfile', 'logout', 'getSessions', 'revokeSession',
        'mfaSetup', 'mfaVerify', 'mfaDisable', 'changePassword',
      ].map((m) => [m, jest.fn()]),
    );
    providersConfig = { getConfig: jest.fn() };
    caslFactory = { explain: jest.fn(), describeForUser: jest.fn(), explainForTarget: jest.fn() };
    delegationTokenService = { sign: jest.fn() };
    aiService = { getAuthorizationChain: jest.fn() };
    usersRepo = { findOne: jest.fn() };
    oauthService = { getOidcAuthorizationUrl: jest.fn() };
    controller = new AuthController(
      authService as unknown as AuthService,
      oauthService as unknown as OAuthService,
      providersConfig as unknown as OAuthProvidersConfigService,
      caslFactory as unknown as CaslAbilityFactory,
      delegationTokenService as unknown as DelegationTokenService,
      aiService as unknown as import('../ai/ai.service').AiService,
      usersRepo as unknown as import('typeorm').Repository<any>,
    );
  });

  it('register 传 deviceId/ip/userAgent', async () => {
    authService.register.mockResolvedValue({ id: 1 });
    const dto = { username: 'alex', password: 'pass1234', email: 'a@b.com' };
    await expect(
      controller.register(dto as any, 'dev-1', mockReq),
    ).resolves.toEqual({ id: 1 });
    expect(authService.register).toHaveBeenCalledWith(dto, {
      deviceId: 'dev-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('login 把 deviceId 写入 dto 并传元数据', async () => {
    authService.login.mockResolvedValue({ accessToken: 't' });
    const dto = { username: 'alex', password: 'pass1234' } as any;
    await controller.login(dto, 'dev-2', mockReq);
    expect(dto.deviceId).toBe('dev-2');
    expect(authService.login).toHaveBeenCalledWith(dto, {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('oauthLogin 委托 service', async () => {
    authService.oAuthLogin.mockResolvedValue({ accessToken: 't' });
    const dto = { provider: 'wechat', code: 'x' };
    await controller.oauthLogin(dto as any, undefined, mockReq);
    expect(authService.oAuthLogin).toHaveBeenCalledWith(dto, {
      deviceId: undefined,
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('getProviders 委托 providersConfig', async () => {
    const cfg = { providers: [] };
    providersConfig.getConfig.mockResolvedValue(cfg);
    await expect(controller.getProviders()).resolves.toBe(cfg);
  });

  it('getOidcUrl 委托 oauthService 并返回 { url }', async () => {
    oauthService.getOidcAuthorizationUrl.mockResolvedValue('https://idp.example.com/auth?client_id=x');
    await expect(controller.getOidcUrl('https://app.example.com/auth/oidc/callback')).resolves.toEqual({
      url: 'https://idp.example.com/auth?client_id=x',
    });
    expect(oauthService.getOidcAuthorizationUrl).toHaveBeenCalledWith('https://app.example.com/auth/oidc/callback');
  });

  it('getOidcUrl 缺 redirectUri → BadRequestException', async () => {
    await expect(controller.getOidcUrl(undefined)).rejects.toThrow('redirectUri is required');
    expect(oauthService.getOidcAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('refresh 委托 service.refreshToken', async () => {
    authService.refreshToken.mockResolvedValue({ accessToken: 't' });
    const dto = { refreshToken: 'r' };
    await expect(controller.refresh(dto as any)).resolves.toEqual({ accessToken: 't' });
    expect(authService.refreshToken).toHaveBeenCalledWith(dto);
  });

  it('forgotPassword / resetPassword / verifyEmail / resendVerification 委托 service', async () => {
    authService.forgotPassword.mockResolvedValue({ sent: true });
    authService.resetPassword.mockResolvedValue({ ok: true });
    authService.verifyEmail.mockResolvedValue({ verified: true });
    authService.resendVerification.mockResolvedValue({ sent: true });

    await controller.forgotPassword({ email: 'a@b.com' } as any);
    await controller.resetPassword({ token: 't', password: 'x' } as any);
    await controller.verifyEmail({ email: 'a@b.com', code: '123456' } as any);
    await controller.resendVerification({ email: 'a@b.com' } as any);

    expect(authService.forgotPassword).toHaveBeenCalled();
    expect(authService.resetPassword).toHaveBeenCalled();
    expect(authService.verifyEmail).toHaveBeenCalled();
    expect(authService.resendVerification).toHaveBeenCalled();
  });

  it('sendSmsCode / loginPhone 委托 service', async () => {
    authService.sendSmsCode.mockResolvedValue({ sent: true });
    authService.loginPhone.mockResolvedValue({ accessToken: 't' });
    await controller.sendSmsCode({ phone: '13800000000' } as any);
    await controller.loginPhone({ phone: '13800000000', code: '1234' } as any, 'dev-3', mockReq);
    expect(authService.sendSmsCode).toHaveBeenCalled();
    expect(authService.loginPhone).toHaveBeenCalled();
  });

  it('bindPhone 传 userId', async () => {
    authService.bindPhone.mockResolvedValue({ phone: '13800000000' });
    const dto = { phone: '13800000000', code: '1234' };
    await expect(controller.bindPhone(mockUser as any, dto as any)).resolves.toEqual({ phone: '13800000000' });
    expect(authService.bindPhone).toHaveBeenCalledWith(1, dto);
  });

  it('deactivate 返回 null', async () => {
    authService.deactivateAccount.mockResolvedValue(undefined);
    const dto = { password: 'pass1234' };
    await expect(controller.deactivate(mockUser as any, dto as any)).resolves.toBeNull();
    expect(authService.deactivateAccount).toHaveBeenCalledWith(1, dto);
  });

  it('exportData / getInviteInfo / getProfile / getSessions 传 userId', async () => {
    authService.exportData.mockResolvedValue({ data: [] });
    authService.getInviteInfo.mockResolvedValue({ inviteCode: 'ABC' });
    authService.getProfile.mockResolvedValue({ username: 'alex' });
    authService.getSessions.mockResolvedValue([]);

    await controller.exportData(mockUser as any);
    await controller.getInvite(mockUser as any);
    await controller.getProfile(mockUser as any);
    await controller.getSessions(mockUser as any, 'dev-9');

    expect(authService.exportData).toHaveBeenCalledWith(1);
    expect(authService.getInviteInfo).toHaveBeenCalledWith(1);
    expect(authService.getProfile).toHaveBeenCalledWith(1);
    expect(authService.getSessions).toHaveBeenCalledWith(1, 'dev-9');
  });

  it('logout / revokeSession 返回 null', async () => {
    authService.logout.mockResolvedValue(undefined);
    authService.revokeSession.mockResolvedValue(undefined);
    await expect(controller.logout(mockUser as any, 'dev-1')).resolves.toBeNull();
    await expect(controller.revokeSession(mockUser as any, 3)).resolves.toBeNull();
    expect(authService.logout).toHaveBeenCalledWith(1, 'dev-1');
    expect(authService.revokeSession).toHaveBeenCalledWith(1, 3);
  });

  describe('Explainable Authz / delegation / MFA', () => {
    it('issueDelegationToken 委托 delegationTokenService.sign', async () => {
      delegationTokenService.sign.mockReturnValue('jwt-token');
      await expect(
        controller.issueDelegationToken({ audience: 'crm', ttlSeconds: 300 } as any, mockUser as any),
      ).resolves.toBe('jwt-token');
      expect(delegationTokenService.sign).toHaveBeenCalledWith('1', 'crm', 300);
    });

    it('getMyPermissions 委托 caslFactory.describeForUser', async () => {
      caslFactory.describeForUser.mockReturnValue({ permissions: [] });
      await expect(controller.getMyPermissions(mockUser as any)).resolves.toEqual({ permissions: [] });
      expect(caslFactory.describeForUser).toHaveBeenCalledWith(mockUser);
    });

    it('explainPermission 委托 caslFactory.explain', async () => {
      caslFactory.explain.mockReturnValue({ allowed: true, basis: [] });
      const body = { action: 'read', subject: 'Event' };
      await expect(controller.explainPermission(mockUser as any, body as any)).resolves.toEqual({ allowed: true, basis: [] });
      expect(caslFactory.explain).toHaveBeenCalledWith(mockUser, 'read', 'Event');
    });

    it('explainPermissionForTarget 委托 usersRepo + explainForTarget', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 5, role: 'admin', username: 'boss' });
      caslFactory.explainForTarget.mockReturnValue({ allowed: true });
      const body = { userId: 5, action: 'manage', subject: 'all' };
      const result = await controller.explainPermissionForTarget(body as any);
      expect(usersRepo.findOne).toHaveBeenCalledWith({ where: { id: 5 }, select: { id: true, role: true, username: true } });
      expect(result.userId).toBe(5);
      expect(result.username).toBe('boss');
      expect(caslFactory.explainForTarget).toHaveBeenCalledWith({ role: 'admin', sub: 5 }, 'manage', 'all');
    });

    it('explainPermissionForTarget 用户不存在抛 404', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      await expect(controller.explainPermissionForTarget({ userId: 999, action: 'read', subject: 'Event' } as any))
        .rejects.toThrow('用户不存在');
    });

    it('mfaSetup/verify/disable 委托 authService', async () => {
      authService.mfaSetup.mockResolvedValue({ secret: 's', otpauthUrl: 'otpauth://' });
      authService.mfaVerify.mockResolvedValue({ ok: true });
      authService.mfaDisable.mockResolvedValue({ ok: true });
      await expect(controller.mfaSetup(mockUser as any)).resolves.toEqual({ secret: 's', otpauthUrl: 'otpauth://' });
      await expect(controller.mfaVerify(mockUser as any, { secret: 's', code: '123456' } as any)).resolves.toEqual({ ok: true });
      await expect(controller.mfaDisable(mockUser as any, { code: '123456' } as any)).resolves.toEqual({ ok: true });
      expect(authService.mfaSetup).toHaveBeenCalledWith(1, 'alex');
      expect(authService.mfaVerify).toHaveBeenCalledWith(1, 's', '123456');
      expect(authService.mfaDisable).toHaveBeenCalledWith(1, '123456');
    });

    it('changePassword 委托 authService', async () => {
      authService.changePassword.mockResolvedValue({ ok: true });
      const dto = { currentPassword: 'old', newPassword: 'NewPass123' };
      await expect(controller.changePassword(mockUser as any, dto as any)).resolves.toEqual({ ok: true });
      expect(authService.changePassword).toHaveBeenCalledWith(1, dto);
    });
  });
});
