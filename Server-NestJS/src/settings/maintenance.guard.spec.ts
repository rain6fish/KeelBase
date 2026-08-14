import { BusinessException } from '../common/errors/business.exception';
import { MaintenanceGuard } from './maintenance.guard';
import { SettingsService } from './settings.service';

function makeContext(overrides: { user?: { role: string } | null } = {}) {
  const req = { user: overrides.user ?? null };
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

describe('MaintenanceGuard', () => {
  const settings = { isMaintenanceMode: jest.fn() } as unknown as SettingsService;
  const reflector = { getAllAndOverride: jest.fn() };

  beforeEach(() => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(undefined);
  });

  it('未开启维护模式时全部放行', async () => {
    settings.isMaintenanceMode = jest.fn().mockResolvedValue(false);
    const guard = new MaintenanceGuard(reflector, settings);
    expect(await guard.canActivate(makeContext({ user: { role: 'user' } }))).toBe(true);
  });

  it('维护模式下 admin 放行', async () => {
    settings.isMaintenanceMode = jest.fn().mockResolvedValue(true);
    const guard = new MaintenanceGuard(reflector, settings);
    expect(await guard.canActivate(makeContext({ user: { role: 'admin' } }))).toBe(true);
  });

  it('维护模式下普通用户抛 MAINTENANCE_MODE', async () => {
    settings.isMaintenanceMode = jest.fn().mockResolvedValue(true);
    const guard = new MaintenanceGuard(reflector, settings);
    await expect(guard.canActivate(makeContext({ user: { role: 'user' } })))
      .rejects.toMatchObject({ errorCode: 'MAINTENANCE_MODE' });
  });

  it('维护模式下 @SkipMaintenance 端点放行', async () => {
    settings.isMaintenanceMode = jest.fn().mockResolvedValue(true);
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    const guard = new MaintenanceGuard(reflector, settings);
    expect(await guard.canActivate(makeContext())).toBe(true);
  });

  it('维护模式下未认证请求拒绝（无 user）', async () => {
    settings.isMaintenanceMode = jest.fn().mockResolvedValue(true);
    const guard = new MaintenanceGuard(reflector, settings);
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(BusinessException);
  });
});
