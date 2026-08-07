import { ForbiddenException } from '@nestjs/common';
import { EmailVerificationGuard } from './email-verification.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SKIP_EMAIL_VERIFICATION_KEY } from './skip-email-verification.decorator';
import { UsersService } from '../../users/users.service';

describe('EmailVerificationGuard', () => {
  let guard: EmailVerificationGuard;
  const mockUsersService = { findOne: jest.fn() };

  function buildGuard(metadata: Record<string, boolean>) {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => metadata[key] ?? false),
    };
    return new EmailVerificationGuard(reflector as any, mockUsersService as unknown as UsersService);
  }

  function mockContext(method: string, user?: any) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  beforeEach(() => jest.clearAllMocks());

  it('allows GET requests', async () => {
    guard = buildGuard({});
    await expect(guard.canActivate(mockContext('GET', { sub: 1 }))).resolves.toBe(true);
  });

  it('allows @Public endpoints', async () => {
    guard = buildGuard({ [IS_PUBLIC_KEY]: true });
    await expect(guard.canActivate(mockContext('POST'))).resolves.toBe(true);
  });

  it('allows @SkipEmailVerification endpoints', async () => {
    guard = buildGuard({ [SKIP_EMAIL_VERIFICATION_KEY]: true });
    await expect(guard.canActivate(mockContext('POST', { sub: 1 }))).resolves.toBe(true);
  });

  it('allows unauthenticated requests', async () => {
    guard = buildGuard({});
    await expect(guard.canActivate(mockContext('POST'))).resolves.toBe(true);
  });

  it('allows admin users without verification', async () => {
    guard = buildGuard({});
    await expect(guard.canActivate(mockContext('POST', { sub: 1, role: 'admin' }))).resolves.toBe(true);
    expect(mockUsersService.findOne).not.toHaveBeenCalled();
  });

  it('allows verified users', async () => {
    guard = buildGuard({});
    mockUsersService.findOne.mockResolvedValue({ emailVerified: true });
    await expect(guard.canActivate(mockContext('POST', { sub: 1 }))).resolves.toBe(true);
  });

  it('rejects unverified user write with ForbiddenException', async () => {
    guard = buildGuard({});
    mockUsersService.findOne.mockResolvedValue({ emailVerified: false });
    await expect(guard.canActivate(mockContext('POST', { sub: 1 })))
      .rejects.toThrow(ForbiddenException);
  });
});
