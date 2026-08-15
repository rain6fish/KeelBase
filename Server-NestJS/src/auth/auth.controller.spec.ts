import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthProvidersConfigService } from './oauth-providers.config';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Record<string, jest.Mock>;
  let providersConfig: { getConfig: jest.Mock };

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
      ].map((m) => [m, jest.fn()]),
    );
    providersConfig = { getConfig: jest.fn() };
    controller = new AuthController(
      authService as unknown as AuthService,
      providersConfig as unknown as OAuthProvidersConfigService,
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
});
