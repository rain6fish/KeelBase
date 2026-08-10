import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BusinessException } from '../common/errors/business.exception';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { EncryptionService } from '../common/utils/encryption';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { User } from '../common/entities/user.entity';
import { UserSession } from './user-session.entity';
import { PhoneVerificationCode } from './phone-verification-code.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { PushToken } from '../push/push-token.entity';
import { AiConversation } from '../ai/conversation/ai-conversation.entity';
import { AiMessage } from '../ai/conversation/ai-message.entity';
import { OperationAuditLog } from '../operation-audit/operation-audit-log.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { OAuthLoginDto } from './dto/oauth-login.dto';

describe('AuthService', () => {
  let service: AuthService;
  let usersRepository: Repository<User>;
  let jwtService: JwtService;
  let configService: ConfigService;
  let oauthService: OAuthService;
  let moduleFixture: TestingModule;

  const mockUser: User = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    password: '$2b$12$hashedpassword',
    role: 'user' as any,
    nickname: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    phone: null as any,
    dateOfBirth: null as any,
    bio: null as any,
    avatarUrl: null as any,
    provider: null as any,
    providerId: null as any,
    refreshTokenHash: null as any,
    loginAttempts: 0,
    lockedUntil: null as any,
    emailVerified: false,
    phoneVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    find: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock.jwt.token'),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        JWT_SECRET: 'test-secret',
        JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '7d',
        LOCKOUT_THRESHOLD: 10,
        LOCKOUT_DURATION: 15,
      };
      return config[key] ?? defaultValue;
    }),
    getOrThrow: jest.fn((key: string) => {
      const secrets: Record<string, string> = {
        JWT_SECRET: 'test-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
      };
      if (!secrets[key]) throw new Error(`Missing config key: ${key}`);
      return secrets[key];
    }),
  };

  const mockOAuthService = {
    verify: jest.fn(),
    verifyCode: jest.fn(),
  };

  const mockEncryption = {
    encrypt: jest.fn((v: string) => `enc:${v}`),
    decrypt: jest.fn((v: string) => (v.startsWith('enc:') ? v.slice(4) : v)),
    hmac: jest.fn((v: string) => `hmac:${v}`),
  };

  const mockMailService = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
  };

  const mockSessionRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const genericRepo = () => ({
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(1),
    createQueryBuilder: jest.fn(() => ({
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  });

  const mockSmsService = {
    sendVerificationCode: jest.fn().mockResolvedValue(undefined),
    enabled: true,
    driver: 'console',
  };

  beforeEach(async () => {
    moduleFixture = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockRepository },
        { provide: getRepositoryToken(UserSession), useValue: mockSessionRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: OAuthService, useValue: mockOAuthService },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: MailService, useValue: mockMailService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: getRepositoryToken(PhoneVerificationCode), useValue: genericRepo() },
        { provide: getRepositoryToken(Event), useValue: genericRepo() },
        { provide: getRepositoryToken(Todo), useValue: genericRepo() },
        { provide: getRepositoryToken(Notification), useValue: genericRepo() },
        { provide: getRepositoryToken(PushToken), useValue: genericRepo() },
        { provide: getRepositoryToken(AiConversation), useValue: genericRepo() },
        { provide: getRepositoryToken(AiMessage), useValue: genericRepo() },
        { provide: getRepositoryToken(OperationAuditLog), useValue: genericRepo() },
      ],
    }).compile();

    service = moduleFixture.get<AuthService>(AuthService);
    usersRepository = moduleFixture.get<Repository<User>>(getRepositoryToken(User));

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterAll(() => {
    service.onModuleDestroy();
  });

  // ─── Register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    const dto: RegisterDto = {
      username: 'newuser',
      email: 'new@example.com',
      password: 'Password1',
      nickname: 'NewUser',
      firstName: 'New',
      lastName: 'User',
    };

    it('should create a user and return tokens', async () => {
      mockRepository.findOne.mockResolvedValue(null); // no duplicate
      const savedUser = {
        id: 2,
        username: 'newuser',
        email: 'new@example.com',
        nickname: 'NewUser',
        firstName: 'New',
        lastName: 'User',
        createdAt: new Date(),
        updatedAt: new Date(),
        password: 'hashed_password',
        refreshTokenHash: null,
        loginAttempts: 0,
        lockedUntil: null,
      };
      mockRepository.create.mockReturnValue(savedUser);
      mockRepository.save.mockResolvedValue(savedUser);

      const result = await service.register(dto);

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.refreshToken).toBe('mock.jwt.token');
      expect(result.user.username).toBe('newuser');
      expect(result.user.email).toBe('new@example.com');
      // Password must never be returned
      expect((result.user as any).password).toBeUndefined();
    });

    it('should throw if username already exists', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.register(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw if email already exists', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(null)  // username check passes
        .mockResolvedValueOnce(mockUser); // email check fails

      await expect(service.register(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── Login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    const loginDto: LoginDto = {
      username: 'testuser',
      password: 'Password1',
      deviceId: '',
    };

    beforeEach(() => {
      mockJwtService.sign.mockReturnValue('mock.access.token');
    });

    it('should login successfully with valid credentials', async () => {
      const userWithPassword = {
        ...mockUser,
        password: await bcrypt.hash('Password1', 12),
      };
      mockRepository.findOne.mockResolvedValue(userWithPassword);

      const result = await service.login(loginDto);

      expect(result.accessToken).toBe('mock.access.token');
      expect(result.user.username).toBe('testuser');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const userWithPassword = {
        ...mockUser,
        password: await bcrypt.hash('Password1', 12),
        loginAttempts: 0,
      };
      mockRepository.findOne.mockResolvedValue(userWithPassword);

      const wrongPassDto = { ...loginDto, password: 'WrongPass1' };
      await expect(service.login(wrongPassDto)).rejects.toThrow(BusinessException);
    });

    it('should throw same error for nonexistent user (no enumeration)', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(BusinessException);
    });

    it('should lock account after exceeding threshold', async () => {
      const userWithPassword = {
        ...mockUser,
        password: await bcrypt.hash('Password1', 12),
        loginAttempts: 9, // one more and it locks
      };
      mockRepository.findOne.mockResolvedValue(userWithPassword);

      const wrongPassDto = { ...loginDto, password: 'WrongPass1' };
      await expect(service.login(wrongPassDto)).rejects.toThrow(BusinessException);

      // Should have reset loginAttempts to 0 and set lockedUntil
      expect(mockRepository.update).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          loginAttempts: 0,
          lockedUntil: expect.any(Date),
        }),
      );
    });

    it('should block login when account is locked', async () => {
      const lockedUser = {
        ...mockUser,
        password: await bcrypt.hash('Password1', 12),
        lockedUntil: new Date(Date.now() + 60 * 60 * 1000), // locked for 1 hour
      };
      mockRepository.findOne.mockResolvedValue(lockedUser);

      await expect(service.login(loginDto)).rejects.toThrow(HttpException);
    });
  });

  // ─── Refresh Token ─────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    const dto: RefreshTokenDto = { refreshToken: 'valid.refresh.token' };

    it('should issue new tokens for a valid refresh token (session-table validation)', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1, username: 'testuser' });

      const tokenHash = crypto.createHash('sha256').update(dto.refreshToken).digest('hex');
      mockSessionRepo.findOne.mockResolvedValue({
        id: 10,
        userId: 1,
        refreshHash: tokenHash,
        lastActiveAt: new Date(),
      });
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.refreshToken(dto);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // 轮换：会话行 hash 更新为新 token
      expect(mockSessionRepo.save).toHaveBeenCalled();
      expect(mockSessionRepo.save.mock.calls[0][0].refreshHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should throw for an invalid refresh token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshToken(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw and revoke all sessions when refresh token hash does not match', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 1, username: 'testuser' });
      mockSessionRepo.findOne.mockResolvedValue(null); // 找不到会话行

      await expect(service.refreshToken(dto)).rejects.toThrow(UnauthorizedException);
      // 疑似泄露 → 撤销该用户全部会话
      expect(mockSessionRepo.delete).toHaveBeenCalledWith({ userId: 1 });
    });
  });

  // ─── Sessions ─────────────────────────────────────────────────────────────

  describe('getSessions', () => {
    it('should return sessions with isCurrent flag', async () => {
      mockSessionRepo.find.mockResolvedValue([
        { id: 1, deviceId: 'dev-1', deviceName: 'Chrome', ip: '1.1.1.1', createdAt: new Date(), lastActiveAt: new Date(), expiresAt: new Date() },
        { id: 2, deviceId: 'dev-2', deviceName: 'iPhone', ip: '2.2.2.2', createdAt: new Date(), lastActiveAt: new Date(), expiresAt: new Date() },
      ]);

      const result = await service.getSessions(1, 'dev-2');

      expect(result).toHaveLength(2);
      expect(result[0].isCurrent).toBe(false);
      expect(result[1].isCurrent).toBe(true);
      expect(result[1].deviceName).toBe('iPhone');
    });
  });

  describe('revokeSession', () => {
    it('should delete own session', async () => {
      mockSessionRepo.findOne.mockResolvedValue({ id: 5, userId: 1 });

      await service.revokeSession(1, 5);

      expect(mockSessionRepo.delete).toHaveBeenCalledWith({ id: 5 });
    });

    it('should reject revoking another user session', async () => {
      mockSessionRepo.findOne.mockResolvedValue({ id: 5, userId: 2 });

      await expect(service.revokeSession(1, 5)).rejects.toThrow(BusinessException);
      expect(mockSessionRepo.delete).not.toHaveBeenCalled();
    });
  });

  // ─── Get Profile ───────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return user profile', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getProfile(1);

      expect(result.username).toBe('testuser');
      expect(result.email).toBe('test@example.com');
      expect(result.role).toBeDefined();
    });

    it('should throw if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getProfile(999)).rejects.toThrow(BusinessException);
    });
  });

  // ─── Logout ────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke current device sessions and clear refresh token hash', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 } as any);

      await service.logout(1, 'dev-1');

      expect(mockSessionRepo.delete).toHaveBeenCalledWith({ userId: 1, deviceId: 'dev-1' });
      expect(mockRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ refreshTokenHash: null }),
      );
    });

    it('should revoke all sessions when no deviceId provided', async () => {
      await service.logout(1);

      expect(mockSessionRepo.delete).toHaveBeenCalledWith({ userId: 1 });
    });
  });

  // ─── OAuth Login ───────────────────────────────────────────────────────────

  describe('oAuthLogin', () => {
    const dto: OAuthLoginDto = {
      provider: 'google' as any,
      idToken: 'google-id-token',
      clientId: 'google-client-id',
      authorizationCode: undefined,
      redirectUri: undefined,
    };

    beforeEach(() => {
      mockJwtService.sign.mockReturnValue('mock.access.token');
    });

    it('should auto-create a new user on first OAuth login', async () => {
      mockOAuthService.verify.mockResolvedValue({
        providerId: 'google_12345',
        email: 'oauth_new@example.com',
        name: 'OAuth User',
        avatarUrl: 'https://example.com/avatar.png',
      });
      // No user found by providerId
      mockRepository.findOne.mockResolvedValueOnce(null);
      // No user found by email
      mockRepository.findOne.mockResolvedValueOnce(null);
      // Verify unique username not taken
      mockRepository.findOne.mockResolvedValueOnce(null);
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockResolvedValue(mockUser);

      const result = await service.oAuthLogin(dto);

      expect(result.accessToken).toBe('mock.access.token');
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should link OAuth to existing account by email', async () => {
      mockOAuthService.verify.mockResolvedValue({
        providerId: 'google_67890',
        email: mockUser.email,
        name: 'Test User',
      });
      // No user by providerId
      mockRepository.findOne.mockResolvedValueOnce(null);
      // Found by email
      mockRepository.findOne.mockResolvedValueOnce(mockUser);

      const result = await service.oAuthLogin(dto);

      expect(result.user.email).toBe(mockUser.email);
      // Should have linked provider（providerId 加密存储 + providerHash 派生）
      expect(mockRepository.update).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          provider: 'google',
          providerId: 'enc:google_67890',
          providerHash: 'hmac:google_67890',
        }),
      );
    });

    it('should login existing OAuth user by providerId', async () => {
      mockOAuthService.verify.mockResolvedValue({
        providerId: 'google_12345',
        email: 'existing_oauth@example.com',
        name: 'Existing OAuth',
      });
      // Found by providerId
      mockRepository.findOne.mockResolvedValueOnce({
        ...mockUser,
        provider: 'google',
        providerId: 'google_12345',
      });

      const result = await service.oAuthLogin(dto);

      expect(result.accessToken).toBe('mock.access.token');
      // Only one findOne call for provider lookup
      expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
    });
  });

  // ─── forgotPassword ────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('should send reset email when email registered', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockUser);
      mockRepository.save.mockResolvedValueOnce(mockUser);

      const result = await service.forgotPassword({ email: 'test@example.com' });

      expect(result.message).toContain('reset link');
      // Stored hash + expiry
      const saved = mockRepository.save.mock.calls[0][0];
      expect(saved.resetTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(saved.resetTokenExpiresAt).toBeInstanceOf(Date);
      // Email with link
      expect(mockMailService.sendPasswordResetEmail).toHaveBeenCalled();
      const [to, url] = mockMailService.sendPasswordResetEmail.mock.calls[0];
      expect(to).toBe('test@example.com');
      expect(url).toContain('/reset?token=');
    });

    it('should return uniform response for unknown email (anti-enumeration)', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.forgotPassword({ email: 'nobody@example.com' });

      expect(result.message).toContain('reset link');
      expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should not throw when email sending fails', async () => {
      mockRepository.findOne.mockResolvedValueOnce(mockUser);
      mockMailService.sendPasswordResetEmail.mockRejectedValueOnce(new Error('smtp down'));

      const result = await service.forgotPassword({ email: 'test@example.com' });

      expect(result.message).toContain('reset link');
    });
  });

  // ─── resetPassword ─────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    const dto = { token: 'some-token', newPassword: 'NewPass123' };

    it('should reset password and invalidate sessions for valid token', async () => {
      const userWithReset = {
        ...mockUser,
        resetTokenHash: crypto.createHash('sha256').update('some-token').digest('hex'),
        resetTokenExpiresAt: new Date(Date.now() + 600_000),
      };
      mockRepository.findOne.mockResolvedValueOnce(userWithReset);
      mockRepository.save.mockResolvedValueOnce(userWithReset);

      const result = await service.resetPassword(dto);

      expect(result.message).toContain('Password has been reset');
      const saved = mockRepository.save.mock.calls[0][0];
      expect(saved.password).toMatch(/^\$2b\$12\$/); // bcrypt 12
      expect(saved.resetTokenHash).toBeNull();
      expect(saved.resetTokenExpiresAt).toBeNull();
      expect(saved.refreshTokenHash).toBeNull(); // session invalidation
    });

    it('should reject invalid token', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.resetPassword(dto)).rejects.toThrow('Invalid or expired reset token');
    });

    it('should reject expired token', async () => {
      const userWithExpired = {
        ...mockUser,
        resetTokenHash: crypto.createHash('sha256').update('some-token').digest('hex'),
        resetTokenExpiresAt: new Date(Date.now() - 60_000),
      };
      mockRepository.findOne.mockResolvedValueOnce(userWithExpired);

      await expect(service.resetPassword(dto)).rejects.toThrow('Invalid or expired reset token');
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  // ─── verifyEmail ──────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    const dto = { email: 'test@example.com', code: '123456' };

    function unverifiedUser() {
      return {
        ...mockUser,
        emailVerified: false,
        emailVerificationCode: crypto.createHash('sha256').update('123456').digest('hex'),
        emailVerificationExpiresAt: new Date(Date.now() + 600_000),
      };
    }

    it('should mark email verified with valid code', async () => {
      mockRepository.findOne.mockResolvedValueOnce(unverifiedUser());
      mockRepository.save.mockResolvedValueOnce(unverifiedUser());

      const result = await service.verifyEmail(dto);

      expect(result.message).toContain('verified');
      const saved = mockRepository.save.mock.calls[0][0];
      expect(saved.emailVerified).toBe(true);
      expect(saved.emailVerificationCode).toBeNull();
      expect(saved.emailVerificationExpiresAt).toBeNull();
    });

    it('should reject wrong code', async () => {
      mockRepository.findOne.mockResolvedValueOnce({
        ...unverifiedUser(),
        emailVerificationCode: crypto.createHash('sha256').update('000000').digest('hex'),
      });

      await expect(service.verifyEmail(dto)).rejects.toThrow('Invalid or expired verification code');
    });

    it('should reject expired code', async () => {
      mockRepository.findOne.mockResolvedValueOnce({
        ...unverifiedUser(),
        emailVerificationExpiresAt: new Date(Date.now() - 60_000),
      });

      await expect(service.verifyEmail(dto)).rejects.toThrow('Invalid or expired verification code');
    });

    it('should reject when email already verified', async () => {
      mockRepository.findOne.mockResolvedValueOnce({
        ...mockUser,
        emailVerified: true,
      });

      await expect(service.verifyEmail(dto)).rejects.toThrow('Invalid or expired verification code');
    });
  });

  // ─── resendVerification ───────────────────────────────────────────────────

  describe('resendVerification', () => {
    it('should resend code for unverified registered email', async () => {
      mockRepository.findOne.mockResolvedValueOnce({
        ...mockUser,
        emailVerified: false,
      });
      mockRepository.save.mockResolvedValueOnce(mockUser);
      mockMailService.sendVerificationEmail.mockClear();

      const result = await service.resendVerification({ email: 'test@example.com' });

      expect(result.message).toContain('verification code');
      expect(mockMailService.sendVerificationEmail).toHaveBeenCalled();
      // 新验证码以 hash 存储
      expect(mockRepository.save.mock.calls[0][0].emailVerificationCode).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return uniform response for unknown email (anti-enumeration)', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      const result = await service.resendVerification({ email: 'nobody@example.com' });

      expect(result.message).toContain('verification code');
      expect(mockMailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('sendSmsCode', () => {
    it('creates a hashed code and calls sms provider', async () => {
      const phoneRepo = moduleFixture.get(getRepositoryToken(PhoneVerificationCode));
      (phoneRepo as any).findOne.mockResolvedValue(null);
      (phoneRepo as any).save.mockImplementation((d: any) => Promise.resolve(d));

      const result = await service.sendSmsCode({ phone: '+8613800138000' });

      expect(result.sent).toBe(true);
      const saved = (phoneRepo as any).save.mock.calls[0][0];
      expect(saved.codeHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256
      expect(saved.codeHash).not.toBe(saved.phone);
      expect(mockSmsService.sendVerificationCode).toHaveBeenCalled();
    });

    it('reuses an existing unexpired code within 5 min', async () => {
      const phoneRepo = moduleFixture.get(getRepositoryToken(PhoneVerificationCode));
      const fiveMinAgo = new Date(Date.now() - 60 * 1000);
      (phoneRepo as any).findOne.mockResolvedValue({
        phone: '+8613800138000',
        used: false,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        createdAt: fiveMinAgo,
      });

      const result = await service.sendSmsCode({ phone: '+8613800138000' });

      expect(result.sent).toBe(true);
      expect(phoneRepo.save).not.toHaveBeenCalled();
      expect(mockSmsService.sendVerificationCode).not.toHaveBeenCalled();
    });
  });

  describe('bindPhone', () => {
    it('verifies code and stores encrypted phone + phoneHash', async () => {
      const phoneRepo = moduleFixture.get(getRepositoryToken(PhoneVerificationCode));
      const code = '123456';
      (phoneRepo as any).findOne.mockResolvedValue({
        phone: '+8613800138000',
        used: false,
        codeHash: crypto.createHash('sha256').update(code).digest('hex'),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
      (phoneRepo as any).update.mockResolvedValue({ affected: 1 });
      mockRepository.findOne.mockResolvedValue(null); // 无他人占用
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.bindPhone(1, { phone: '+8613800138000', code });

      expect(result.phoneVerified).toBe(true);
      expect(mockRepository.update).toHaveBeenCalledWith(1, expect.objectContaining({ phoneHash: 'hmac:+8613800138000' }));
    });

    it('rejects wrong code with 400', async () => {
      const phoneRepo = moduleFixture.get(getRepositoryToken(PhoneVerificationCode));
      (phoneRepo as any).findOne.mockResolvedValue({
        phone: '+8613800138000',
        used: false,
        codeHash: crypto.createHash('sha256').update('999999').digest('hex'),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      await expect(service.bindPhone(1, { phone: '+8613800138000', code: '123456' }))
        .rejects.toMatchObject({ errorCode: 'VERIFICATION_CODE_INVALID' });
    });
  });

  describe('loginPhone', () => {
    it('logs in with valid code and issues tokens', async () => {
      const phoneRepo = moduleFixture.get(getRepositoryToken(PhoneVerificationCode));
      (phoneRepo as any).findOne.mockResolvedValue({
        phone: '+8613800138000',
        used: false,
        codeHash: crypto.createHash('sha256').update('123456').digest('hex'),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
      (phoneRepo as any).update.mockResolvedValue({ affected: 1 });
      mockRepository.findOne.mockResolvedValue({ ...mockUser, phoneHash: 'hmac:+8613800138000' });
      mockSessionRepo.create.mockImplementation((d: any) => d);
      mockSessionRepo.save.mockResolvedValue({});

      const result = await service.loginPhone({ phone: '+8613800138000', code: '123456' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.username).toBe('testuser');
    });

    it('rejects unregistered phone', async () => {
      const phoneRepo = moduleFixture.get(getRepositoryToken(PhoneVerificationCode));
      (phoneRepo as any).findOne.mockResolvedValue({
        phone: '+8613800138000',
        used: false,
        codeHash: crypto.createHash('sha256').update('123456').digest('hex'),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.loginPhone({ phone: '+8613800138000', code: '123456' }))
        .rejects.toMatchObject({ errorCode: 'PHONE_NOT_REGISTERED' });
    });
  });

  describe('deactivateAccount', () => {
    it('deletes account and cleans related data after password confirm', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockUser, password: await bcrypt.hash('MyPass123', 4) });
      const convRepo = moduleFixture.get(getRepositoryToken(AiConversation));
      (convRepo as any).find.mockResolvedValue([{ id: 'conv1' }]);

      await service.deactivateAccount(1, { password: 'MyPass123' });

      expect(mockSessionRepo.delete).toHaveBeenCalledWith({ userId: 1 });
      expect(mockRepository.delete).toHaveBeenCalledWith(1);
    });

    it('rejects wrong password', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockUser, password: await bcrypt.hash('MyPass123', 4) });

      await expect(service.deactivateAccount(1, { password: 'wrong' }))
        .rejects.toMatchObject({ errorCode: 'INVALID_CREDENTIALS' });
    });

    it('refuses to delete last admin', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockUser, role: 'admin' as any });
      mockRepository.count.mockResolvedValue(1);

      await expect(service.deactivateAccount(1, { password: 'MyPass123' }))
        .rejects.toMatchObject({ errorCode: 'LAST_ADMIN_PROTECTED' });
    });
  });

  describe('exportData', () => {
    it('returns profile + related data', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockUser, phone: null });
      const todoRepo = moduleFixture.get(getRepositoryToken(Todo));
      const eventRepo = moduleFixture.get(getRepositoryToken(Event));
      const notifRepo = moduleFixture.get(getRepositoryToken(Notification));
      (todoRepo as any).find.mockResolvedValue([{ id: 1, title: 't' }]);
      (eventRepo as any).find.mockResolvedValue([]);
      (notifRepo as any).find.mockResolvedValue([]);

      const result = await service.exportData(1);

      expect(result.profile.username).toBe('testuser');
      expect(result.todos).toHaveLength(1);
      expect(result).toHaveProperty('exportedAt');
    });
  });

  describe('G-2 邀请奖励', () => {
    const dto = {
      username: 'newbie',
      email: 'newbie@example.com',
      password: 'Pass1234',
      nickname: 'Newbie',
    };

    it('注册时生成邀请码', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockImplementation((d: any) => d);
      mockRepository.save.mockResolvedValue({ id: 9, ...dto, inviteCode: 'ABCDEF12' });

      await service.register({ ...dto, inviteCode: undefined } as any);

      expect(mockRepository.create.mock.calls[0][0].inviteCode).toMatch(/^[A-Z0-9]{8}$/);
    });

    it('带有效邀请码注册时绑定邀请者并通知', async () => {
      // findOne 依次: username 查重(null) → email 查重(null) → 邀请码查邀请者
      mockRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 5 });
      const notifications = moduleFixture.get(getRepositoryToken(Notification));
      (notifications.save as jest.Mock).mockResolvedValue({ id: 1 });

      await service.register({ ...dto, inviteCode: 'ABCDEF12' } as any);

      expect(mockRepository.create.mock.calls[0][0].invitedBy).toBe(5);
      expect(notifications.save).toHaveBeenCalled();
    });

    it('getInviteInfo 返回邀请码与邀请列表', async () => {
      mockRepository.findOne.mockResolvedValue({ id: 5, inviteCode: 'ABCDEF12' });
      mockRepository.find.mockResolvedValue([
        { id: 9, username: 'newbie', nickname: 'Newbie', createdAt: new Date() },
      ]);

      const info = await service.getInviteInfo(5);

      expect(info.inviteCode).toBe('ABCDEF12');
      expect(info.invited).toBe(1);
      expect(info.invitees[0].username).toBe('newbie');
    });
  });
});
