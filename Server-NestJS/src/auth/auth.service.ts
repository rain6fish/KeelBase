// SPDX-License-Identifier: Apache-2.0

import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { OAuthLoginDto } from './dto/oauth-login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SendSmsCodeDto } from './dto/send-sms-code.dto';
import { BindPhoneDto } from './dto/bind-phone.dto';
import { LoginPhoneDto } from './dto/login-phone.dto';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { OAuthService } from './oauth.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { BusinessException } from '../common/errors/business.exception';
import { User, UserRole } from '../common/entities/user.entity';
import { UserSession } from './user-session.entity';
import { PhoneVerificationCode } from './phone-verification-code.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { PushToken } from '../push/push-token.entity';
import { AiConversation } from '../ai/conversation/ai-conversation.entity';
import { AiMessage } from '../ai/conversation/ai-message.entity';
import { OperationAuditLog } from '../operation-audit/operation-audit-log.entity';
import { EncryptionService } from '../common/utils/encryption';
import { MfaService } from './mfa/mfa.service';
import { UploadSignService } from '../upload/upload-sign.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { OrgService } from '../org/org.service';

interface DeviceEntry {
  attempts: number;
  firstAttemptAt: number;   // ms timestamp
  unlockedAt: number;       // ms timestamp when cooldown ends, 0 = no cooldown
}

/**
 * Device-based progressive delay for login brute-force protection.
 *
 * After each failed login from the same device, the cooldown period grows
 * exponentially: 2^N seconds (capped at 300s / 5 minutes). The counter
 * resets on successful login or after the device stays quiet for 30 minutes.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly deviceStore = new Map<string, DeviceEntry>();
  private readonly DEVICE_TTL_MS = 30 * 60 * 1000;   // 30 min idle reset
  private readonly MAX_COOLDOWN = 300;                 // 5 min cap (seconds)
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserSession)
    private sessionRepo: Repository<UserSession>,
    @InjectRepository(PhoneVerificationCode)
    private phoneCodeRepo: Repository<PhoneVerificationCode>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private oauthService: OAuthService,
    private encryption: EncryptionService,
    private mfaService: MfaService,
    private mailService: MailService,
    private smsService: SmsService,
    @InjectRepository(Event)
    private eventsRepo: Repository<Event>,
    @InjectRepository(Todo)
    private todosRepo: Repository<Todo>,
    @InjectRepository(Notification)
    private notificationsRepo: Repository<Notification>,
    @InjectRepository(PushToken)
    private pushTokenRepo: Repository<PushToken>,
    @InjectRepository(AiConversation)
    private conversationRepo: Repository<AiConversation>,
    @InjectRepository(AiMessage)
    private aiMessageRepo: Repository<AiMessage>,
    @InjectRepository(OperationAuditLog)
    private opAuditRepo: Repository<OperationAuditLog>,
    private orgService: OrgService,
    private uploadSign: UploadSignService,
  ) {
    this.cleanupTimer = setInterval(() => this._cleanupDevices(), 60_000);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.deviceStore.clear();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  async register(
    dto: RegisterDto,
    clientInfo: { deviceId?: string; ip?: string; userAgent?: string } = {},
  ) {
    const exists = await this.usersRepository.findOne({ where: { username: dto.username } });
    const emailExists = await this.usersRepository.findOne({ where: { email: dto.email } });
    // CR-15②：注册冲突不区分用户名/邮箱（防批量探测枚举），统一口径
    if (exists || emailExists) {
      throw new UnauthorizedException('Username or email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // G-2 邀请：解析邀请码 → 绑定邀请者（无效邀请码静默忽略，不阻断注册）
    let invitedBy: number | undefined;
    if (dto.inviteCode) {
      const inviter = await this.usersRepository.findOne({
        where: { inviteCode: dto.inviteCode.toUpperCase() },
      });
      if (inviter) invitedBy = inviter.id;
    }

    const user = this.usersRepository.create({
      username: dto.username,
      email: dto.email,
      password: hashedPassword,
      nickname: dto.nickname,
      firstName: dto.firstName,
      lastName: dto.lastName,
      dateOfBirth: dto.dateOfBirth,
      phone: dto.phone ? this.encryption.encrypt(dto.phone) : undefined,
      inviteCode: this.generateInviteCode(),
      invitedBy,
    });
    await this.usersRepository.save(user);

    // G-2：邀请成功后给邀请者发奖励通知
    if (invitedBy) {
      await this.notifyInviter(invitedBy, user.username).catch(() => {});
    }

    // ORG-6：注册携带组织邀请码时，自动加入组织（无效/过期/已用静默，不阻断注册）
    if (dto.inviteCode) {
      await this.orgService.redeemOrgInvite(dto.inviteCode.toUpperCase(), user.id).catch(() => {});
    }

    // 发送邮箱验证码（失败不阻断注册）
    await this._sendVerification(user);

    const accessToken = this.generateAccessToken(user.id, user.username, user.role);
    const refreshToken = await this.generateRefreshToken(user);
    await this._createSession(user.id, refreshToken, clientInfo);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
      },
    };
  }

  /**
   * 忘记密码：发送重置邮件。
   *
   * 防枚举：无论邮箱是否存在，都等待随机延迟并返回统一成功响应，
   * 不泄露账号是否存在。
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.delay();

    const user = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = this.hashToken(token);
      user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min
      await this.usersRepository.save(user);

      const baseUrl = this.configService.get<string>('APP_BASE_URL', 'http://localhost:8080');
      const resetUrl = `${baseUrl}/reset?token=${token}`;
      try {
        await this.mailService.sendPasswordResetEmail(dto.email, resetUrl);
      } catch (err) {
        // 邮件失败不阻断：仍返回统一响应（防枚举），错误记日志
        this.logger.warn(`[Auth] sendPasswordResetEmail failed: ${(err as Error).message}`);
      }
    }

    return { message: 'If that email is registered, a reset link has been sent.' };
  }

  /**
   * 重置密码：验证 token → 更新密码 → 清除重置令牌并使现有会话失效。
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({
      where: { resetTokenHash: this.hashToken(dto.token) },
    });

    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);
    user.password = hashedPassword;
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    // 使现有 refresh token 失效，强制重新登录
    user.refreshTokenHash = null;
    await this.usersRepository.save(user);
    // 撤销该用户全部会话（多设备一并登出）
    await this.sessionRepo.delete({ userId: user.id });

    return { message: 'Password has been reset. Please login again.' };
  }

  /**
   * 邮箱验证：校验验证码 → 置 emailVerified=true。
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (!user || user.emailVerified) {
      // 已验证或不存在都视为无效
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    const codeHash = this.hashToken(dto.code);
    if (
      !user.emailVerificationCode ||
      user.emailVerificationCode !== codeHash ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    user.emailVerified = true;
    user.emailVerificationCode = null;
    user.emailVerificationExpiresAt = null;
    await this.usersRepository.save(user);

    this.logger.log(`Email verified: user=${user.username}`);
    return { message: 'Email verified successfully' };
  }

  /**
   * 重新发送邮箱验证码（防枚举：统一响应）。
   */
  async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
    await this.delay();

    const user = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (user && !user.emailVerified) {
      await this._sendVerification(user);
    }

    return { message: 'If that email is registered, a verification code has been sent.' };
  }

  async login(
    dto: LoginDto,
    clientInfo: { ip?: string; userAgent?: string } = {},
  ) {
    // 1. Check device cooldown
    const deviceCheck = this._checkDevice(dto.deviceId);
    if (deviceCheck.blocked) {
      this.logger.warn(
        `Device blocked: device=${dto.deviceId?.slice(0, 8)}..., retry_after=${deviceCheck.retryAfter}s`,
      );
      throw new HttpException(
        { message: 'Too many attempts. Try again later.', retryAfter: deviceCheck.retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.usersRepository.findOne({
      where: { username: dto.username },
      select: {
        id: true,
        username: true,
        password: true,
        nickname: true,
        role: true,
        refreshTokenHash: true,
        loginAttempts: true,
        lockedUntil: true,
        createdAt: true,
        updatedAt: true,
        mfaEnabled: true,
        mfaSecret: true,
        mustChangePassword: true,
      },
    });

    if (!user) {
      this._recordFailure(dto.deviceId);
      await this.delay();
      throw BusinessException.of('INVALID_CREDENTIALS');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remaining = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 1000 / 60,
      );
      this.logger.warn(`Login blocked: user=${dto.username}, lock_remaining=${remaining}min`);
      // CR-15①：锁定态与「不存在/密码错」同一响应 + 延迟（防账号枚举与时序侧信道）
      await this.delay();
      throw BusinessException.of('INVALID_CREDENTIALS');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      // Account-level lockout (existing logic)
      const attempts = user.loginAttempts + 1;
      const threshold = this.configService.get<number>('LOCKOUT_THRESHOLD', 10);
      const durationMinutes = this.configService.get<number>('LOCKOUT_DURATION', 15);

      if (attempts >= threshold) {
        const lockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
        await this.usersRepository.update(user.id, {
          loginAttempts: 0,
          lockedUntil,
        });
        this.logger.warn(`Account locked: user=${dto.username}, duration=${durationMinutes}min`);
      } else {
        await this.usersRepository.update(user.id, { loginAttempts: attempts });
      }

      // Device-level progressive delay
      this._recordFailure(dto.deviceId);

      this.logger.warn(`Login failed: user=${dto.username}, attempts=${attempts}/${threshold}`);
      await this.delay();
      throw BusinessException.of('INVALID_CREDENTIALS');
    }

    // Success — reset both account and device counters
    if (user.loginAttempts > 0 || user.lockedUntil) {
      await this.usersRepository.update(user.id, {
        loginAttempts: 0,
        lockedUntil: null,
      });
    }
    this._resetDevice(dto.deviceId);

    // WEB-FRONT-4 MFA：启用用户需 TOTP 验证（错误统一提示防枚举）
    if (user.mfaEnabled) {
      const secret = user.mfaSecret ? this.encryption.decrypt(user.mfaSecret) : '';
      if (!secret || !this.mfaService.verifyCode(secret, dto.totp ?? '')) {
        // TOTP 失败同样累计失败数 + 锁定（与密码错分支一致），防持密码者换 IP 爆破 6 位 TOTP
        const attempts = user.loginAttempts + 1;
        const threshold = this.configService.get<number>('LOCKOUT_THRESHOLD', 10);
        const durationMinutes = this.configService.get<number>('LOCKOUT_DURATION', 15);
        if (attempts >= threshold) {
          const lockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
          await this.usersRepository.update(user.id, { loginAttempts: 0, lockedUntil });
          this.logger.warn(`Account locked: user=${dto.username}, duration=${durationMinutes}min`);
        } else {
          await this.usersRepository.update(user.id, { loginAttempts: attempts });
        }
        this._recordFailure(dto.deviceId);
        this.logger.warn(`Login MFA failed: user=${dto.username}, attempts=${attempts}/${threshold}`);
        await this.delay();
        throw BusinessException.of('MFA_REQUIRED');
      }
    }

    const accessToken = this.generateAccessToken(user.id, user.username, user.role);
    const refreshToken = await this.generateRefreshToken(user);
    // 登记会话行（多设备会话管理）
    await this._createSession(user.id, refreshToken, {
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
    });

    this.logger.log(`Login success: user=${dto.username}`);

    return {
      accessToken,
      refreshToken,
      mustChangePassword: user.mustChangePassword ?? false,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: user.dateOfBirth,
        phone: this.decryptPhone(user.phone),
        bio: user.bio,
        avatarUrl: this.signedAvatar(user.avatarUrl),
        emailVerified: user.emailVerified,
        createdAt: user.createdAt?.toISOString(),
      },
    };
  }

  async oAuthLogin(
    dto: OAuthLoginDto,
    clientInfo: { deviceId?: string; ip?: string; userAgent?: string } = {},
  ) {
    // 1. Verify the OAuth credential with the provider
    const isCodeFlow = ['wechat', 'alipay', 'oidc'].includes(dto.provider);
    const oauthUser = isCodeFlow
      ? await this.oauthService.verifyCode(dto.provider, dto.authorizationCode!, dto.redirectUri, dto.providerType)
      : await this.oauthService.verify(dto.provider, dto.idToken!, dto.clientId);

    if (!oauthUser.providerId) {
      throw new UnauthorizedException('Invalid OAuth token');
    }

    // 2. Look up existing user by provider + providerHash（providerId 加密存储，用确定性 hash 匹配）
    let user = await this.usersRepository.findOne({
      where: {
        provider: dto.provider,
        providerHash: this.encryption.hmac(oauthUser.providerId),
      },
    });

    // 3. If not found, try matching by email (for returning users who
    //    originally registered with email/password)
    if (!user && oauthUser.email) {
      user = await this.usersRepository.findOne({
        where: { email: oauthUser.email },
      });
      if (user) {
        // Link the provider to the existing account（providerId 加密存储）
        await this.usersRepository.update(user.id, {
          provider: dto.provider,
          providerId: this.encryption.encrypt(oauthUser.providerId),
          providerHash: this.encryption.hmac(oauthUser.providerId),
          avatarUrl: this.signedAvatar(oauthUser.avatarUrl) ?? user.avatarUrl,
        });
      }
    }

    // 4. Auto-create user if neither providerId nor email match
    if (!user) {
      const baseUsername = (oauthUser.email?.split('@')[0] ?? `user_${oauthUser.providerId}`)
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .substring(0, 28);
      const uniqueUsername = await this._generateUniqueUsername(baseUsername);

      // For Chinese providers without email, generate a unique placeholder
      const email = oauthUser.email ?? `${oauthUser.providerId}@${dto.provider}.oauth.local`;

      user = this.usersRepository.create({
        username: uniqueUsername,
        email,
        nickname: oauthUser.name ?? uniqueUsername,
        provider: dto.provider,
        providerId: this.encryption.encrypt(oauthUser.providerId),
        providerHash: this.encryption.hmac(oauthUser.providerId),
        avatarUrl: this.signedAvatar(oauthUser.avatarUrl) ?? undefined,
        password: '', // placeholder, set below
      });
      // Set placeholder password (unusable but non-null to satisfy the column)
      user.password = await bcrypt.hash(
        crypto.randomBytes(32).toString('hex'),
        12,
      );
      await this.usersRepository.save(user);
      this.logger.log(`Auto-created user via ${dto.provider}: ${uniqueUsername}`);
    }

    // 5. Generate tokens (same as login)
    const accessToken = this.generateAccessToken(user.id, user.username, user.role);
    const refreshToken = await this.generateRefreshToken(user);
    await this._createSession(user.id, refreshToken, clientInfo);

    this.logger.log(`OAuth login success: provider=${dto.provider}, user=${user.username}`);

    return {
      accessToken,
      refreshToken,
      mustChangePassword: user.mustChangePassword ?? false,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: user.dateOfBirth,
        phone: this.decryptPhone(user.phone),
        bio: user.bio,
        avatarUrl: this.signedAvatar(user.avatarUrl),
        emailVerified: user.emailVerified,
        createdAt: user.createdAt?.toISOString(),
      },
    };
  }

  // ── WEB-FRONT-4 强制改密 ──

  /** 登录后修改密码：校验当前密码 → 更新新密码 → 清除强制改密标志。 */
  async changePassword(userId: number, dto: ChangePasswordDto): Promise<{ changed: boolean }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.password))) {
      throw BusinessException.of('INVALID_CREDENTIALS');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw BusinessException.of('PASSWORD_SAME_AS_OLD');
    }
    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.usersRepository.update(userId, { password: hashed, mustChangePassword: false });
    return { changed: true };
  }

  // ── WEB-FRONT-4 MFA（TOTP） ──

  /** 启用第一步：生成 secret + otpauth URL（未落库，verify 通过才保存）。 */
  async mfaSetup(userId: number, username: string): Promise<{ secret: string; otpauthUrl: string; alreadyEnabled: boolean }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (user?.mfaEnabled) {
      return { secret: '', otpauthUrl: '', alreadyEnabled: true };
    }
    const secret = this.mfaService.generateSecret();
    return { secret, otpauthUrl: this.mfaService.otpauthUrl(secret, username), alreadyEnabled: false };
  }

  /** 验证绑定 code 并启用 MFA（secret AES 加密落库）。 */
  async mfaVerify(userId: number, secret: string, code: string): Promise<{ enabled: boolean }> {
    if (!this.mfaService.verifyCode(secret, code)) {
      throw BusinessException.of('INVALID_MFA_CODE');
    }
    await this.usersRepository.update(userId, {
      mfaSecret: this.encryption.encrypt(secret),
      mfaEnabled: true,
    });
    return { enabled: true };
  }

  /** 停用 MFA（需正确 TOTP code 确认）。 */
  async mfaDisable(userId: number, code: string): Promise<{ disabled: boolean }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, mfaEnabled: true, mfaSecret: true },
    });
    if (!user?.mfaEnabled || !user.mfaSecret) return { disabled: false };
    const secret = this.encryption.decrypt(user.mfaSecret);
    if (!this.mfaService.verifyCode(secret, code)) {
      throw BusinessException.of('INVALID_MFA_CODE');
    }
    await this.usersRepository.update(userId, { mfaEnabled: false, mfaSecret: null });
    return { disabled: true };
  }

  async refreshToken(dto: RefreshTokenDto) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(dto.refreshToken);
    // 按 refresh token 哈希定位会话行（多设备：每设备一行）
    const session = await this.sessionRepo.findOne({
      where: { refreshHash: tokenHash },
    });

    if (!session || session.userId !== payload.sub) {
      // 失配 → 撤销该用户全部会话（疑似 token 泄露）
      await this.sessionRepo.delete({ userId: payload.sub });
      this.logger.warn(`Refresh token mismatch: userId=${payload.sub}`);
      throw new UnauthorizedException('Token rejected');
    }

    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user) {
      throw BusinessException.of('USER_NOT_FOUND');
    }

    // 轮换：生成新 token → 更新会话行 + 单列
    const accessToken = this.generateAccessToken(user.id, user.username, user.role);
    const newRefreshToken = await this.generateRefreshToken(user);
    session.refreshHash = this.hashToken(newRefreshToken);
    session.lastActiveAt = new Date();
    await this.sessionRepo.save(session);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        dateOfBirth: user.dateOfBirth,
        phone: this.decryptPhone(user.phone),
        bio: user.bio,
        avatarUrl: this.signedAvatar(user.avatarUrl),
        emailVerified: user.emailVerified,
        createdAt: user.createdAt?.toISOString(),
      },
    };
  }

  /**
   * 当前用户的会话列表（含 isCurrent 标记）。
   */
  async getSessions(userId: number, currentDeviceId?: string): Promise<any[]> {
    const sessions = await this.sessionRepo.find({
      where: { userId },
      order: { lastActiveAt: 'DESC' },
    });
    return sessions.map((s) => ({
      id: s.id,
      deviceId: s.deviceId,
      deviceName: s.deviceName,
      ip: s.ip,
      createdAt: s.createdAt?.toISOString(),
      lastActiveAt: s.lastActiveAt?.toISOString(),
      expiresAt: s.expiresAt?.toISOString(),
      isCurrent: !!currentDeviceId && s.deviceId === currentDeviceId,
    }));
  }

  /**
   * 远程登出：删除指定会话（本人）。
   */
  async revokeSession(userId: number, sessionId: number): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw BusinessException.of('SESSION_NOT_FOUND');
    }
    await this.sessionRepo.delete({ id: sessionId });
    this.logger.log(`Session revoked: userId=${userId}, sessionId=${sessionId}`);
  }

  /** G-2 邀请信息：本人邀请码 + 已邀请用户列表。 */
  async getInviteInfo(userId: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) return { inviteCode: null, invited: 0, invitees: [] };
    const invitees = await this.usersRepository.find({
      where: { invitedBy: userId },
      select: { id: true, username: true, nickname: true, createdAt: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return {
      inviteCode: user.inviteCode ?? null,
      invited: invitees.length,
      invitees: invitees.map((i) => ({
        id: i.id,
        username: i.username,
        nickname: i.nickname,
        createdAt: i.createdAt,
      })),
    };
  }

  private generateInviteCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    // 每字节取模映射到字符集，6 字节 → 8 位（多余字节丢弃，避免 undefined）
    const rand = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      code += chars[rand[i] % chars.length];
    }
    return code;
  }

  private async notifyInviter(inviterId: number, newUsername: string): Promise<void> {
    await this.notificationsRepo.save(
      this.notificationsRepo.create({
        userId: inviterId,
        title: '邀请成功',
        body: `你邀请的用户 ${newUsername} 已注册成功`,
        type: 'invite_reward',
      }),
    );
  }

  async getProfile(userId: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw BusinessException.of('USER_NOT_FOUND');
    }
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth,
      phone: this.decryptPhone(user.phone),
      bio: user.bio,
      avatarUrl: this.signedAvatar(user.avatarUrl),
      createdAt: user.createdAt.toISOString(),
    };
  }

  async logout(userId: number, deviceId?: string) {
    // 多设备：只登出当前设备（按 deviceId 删会话行）；deviceId 缺失时回退清全部
    if (deviceId) {
      await this.sessionRepo.delete({ userId, deviceId });
    } else {
      await this.sessionRepo.delete({ userId });
    }
    await this.usersRepository.update(userId, {
      refreshTokenHash: null,
    });
    this.logger.log(`User logged out: userId=${userId}, device=${deviceId ?? 'all'}`);
  }

  // ─── Device rate limiting ────────────────────────────────────────────────

  /**
   * Check if this device is currently in cooldown.
   * Returns { blocked, retryAfter } where retryAfter is seconds remaining.
   */
  private _checkDevice(deviceId: string | undefined): { blocked: boolean; retryAfter: number } {
    if (!deviceId) return { blocked: false, retryAfter: 0 };

    const entry = this.deviceStore.get(deviceId);
    if (!entry) return { blocked: false, retryAfter: 0 };

    // Idle timeout — reset if the device hasn't attempted anything in 30 min
    if (Date.now() - entry.firstAttemptAt > this.DEVICE_TTL_MS) {
      this.deviceStore.delete(deviceId);
      return { blocked: false, retryAfter: 0 };
    }

    if (entry.unlockedAt > Date.now()) {
      const retryAfter = Math.ceil((entry.unlockedAt - Date.now()) / 1000);
      return { blocked: true, retryAfter };
    }

    return { blocked: false, retryAfter: 0 };
  }

  /**
   * Record a failed attempt and calculate the next cooldown.
   * Cooldown = 2^N seconds, capped at MAX_COOLDOWN (5 min).
   */
  private _recordFailure(deviceId: string | undefined) {
    if (!deviceId) return;

    const now = Date.now();
    const prev = this.deviceStore.get(deviceId);

    if (!prev || now - prev.firstAttemptAt > this.DEVICE_TTL_MS) {
      // Fresh entry or expired — start at attempt 1
      const cooldown = Math.min(Math.pow(2, 1), this.MAX_COOLDOWN);
      this.deviceStore.set(deviceId, {
        attempts: 1,
        firstAttemptAt: now,
        unlockedAt: now + cooldown * 1000,
      });
    } else {
      const n = prev.attempts + 1;
      const cooldown = Math.min(Math.pow(2, n), this.MAX_COOLDOWN);
      prev.attempts = n;
      prev.unlockedAt = now + cooldown * 1000;
      this.logger.debug(
        `Device cooldown: device=${deviceId.slice(0, 8)}..., attempt=${n}, wait=${cooldown}s`,
      );
    }
  }

  private _resetDevice(deviceId: string | undefined) {
    if (deviceId) this.deviceStore.delete(deviceId);
  }

  private _cleanupDevices() {
    const now = Date.now();
    for (const [id, entry] of this.deviceStore.entries()) {
      if (now - entry.firstAttemptAt > this.DEVICE_TTL_MS) {
        this.deviceStore.delete(id);
      }
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private generateAccessToken(userId: number, username: string, role: string): string {
    // Agent Identity（评审二 §5）：access token 带 jti 作 sessionId——每次访问令牌唯一标识，审计 actor 上下文用
    const payload: JwtPayload & { jti: string } = {
      sub: userId,
      username,
      role: role as any,
      jti: crypto.randomBytes(8).toString('hex'),
    };
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '15m');
    return this.jwtService.sign(payload, { expiresIn } as JwtSignOptions);
  }

  private async generateRefreshToken(user: User): Promise<string> {
    const payload: JwtPayload & { jti: string } = {
      sub: user.id,
      username: user.username,
      role: user.role,
      // jti guarantees uniqueness — without it, two tokens signed within the
      // same second are byte-identical and rotation is ineffective
      jti: crypto.randomBytes(16).toString('hex'),
    };
    const secret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    const expiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const refreshToken = this.jwtService.sign(payload, {
      secret,
      expiresIn,
    } as JwtSignOptions);

    user.refreshTokenHash = this.hashToken(refreshToken);
    await this.usersRepository.save(user);
    return refreshToken;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * 生成并发送 6 位邮箱验证码（10 分钟有效）。
   */
  private async _sendVerification(user: User): Promise<void> {
    const code = crypto.randomInt(100000, 1000000).toString();
    user.emailVerificationCode = this.hashToken(code);
    user.emailVerificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.usersRepository.save(user);

    try {
      await this.mailService.sendVerificationEmail(user.email, code);
    } catch (err) {
      // 邮件失败不阻断（防枚举同 forgot），错误记日志
      this.logger.warn(`[Auth] sendVerificationEmail failed: ${(err as Error).message}`);
    }
  }

  /**
   * 登记登录会话行（多设备会话管理）。
   */
  private async _createSession(
    userId: number,
    refreshToken: string,
    info: { deviceId?: string; deviceName?: string; ip?: string; userAgent?: string },
  ): Promise<void> {
    const session = this.sessionRepo.create({
      userId,
      refreshHash: this.hashToken(refreshToken),
      deviceId: info.deviceId || null,
      deviceName: info.deviceName || null,
      userAgent: info.userAgent?.slice(0, 255) || null,
      ip: info.ip || null,
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7d
    });
    await this.sessionRepo.save(session);
  }

  private decryptPhone(encrypted?: string | null): string | null | undefined {
    if (!encrypted) return encrypted;
    return this.encryption.decrypt(encrypted);
  }

  /** CR-21：头像等 /uploads 资源附签名 URL（null/绝对 URL 原样） */
  private signedAvatar(url?: string | null): string | null | undefined {
    if (!url) return url;
    return this.uploadSign.signUrl(url);
  }

  private async delay() {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
  }

  /**
   * Generate a unique username by appending a random suffix if the base
   * name is already taken.
   */
  // ─── SMS 手机号验证 ──────────────────────────────────────────────────────

  /**
   * 发送短信验证码。防枚举：无论手机号是否注册均返回统一成功。
   * 5 分钟内同手机号已有有效未用验证码时直接复用（不重复发送）。
   */
  async sendSmsCode(dto: SendSmsCodeDto): Promise<{ sent: boolean }> {
    const now = new Date();
    // 复用有效未用验证码（同 phone 5 分钟内）
    const existing = await this.phoneCodeRepo.findOne({
      where: { phone: dto.phone, used: false },
      order: { createdAt: 'DESC' },
    });
    if (existing && existing.expiresAt > now && now.getTime() - existing.createdAt.getTime() < 5 * 60 * 1000) {
      return { sent: true };
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    await this.phoneCodeRepo.save({
      phone: dto.phone,
      codeHash: this.hashToken(code),
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      used: false,
    });
    await this.smsService.sendVerificationCode(dto.phone, code);
    return { sent: true };
  }

  /**
   * 绑定/更新手机号。校验验证码；手机号已被他人绑定则 409。
   */
  async bindPhone(userId: number, dto: BindPhoneDto): Promise<{ phone: string; phoneVerified: boolean }> {
    await this._verifyPhoneCode(dto.phone, dto.code);

    const existing = await this.usersRepository.findOne({ where: { phoneHash: this.encryption.hmac(dto.phone) } });
    if (existing && existing.id !== userId) {
      throw BusinessException.of('PHONE_ALREADY_BOUND');
    }

    await this.usersRepository.update(userId, {
      phone: this.encryption.encrypt(dto.phone),
      phoneHash: this.encryption.hmac(dto.phone),
      phoneVerified: true,
    });
    return { phone: dto.phone, phoneVerified: true };
  }

  /**
   * 手机号 + 验证码登录。未注册手机号返回统一 404；签发 token + 登记会话。
   */
  async loginPhone(
    dto: LoginPhoneDto,
    clientInfo: { ip?: string; userAgent?: string } = {},
  ) {
    await this._verifyPhoneCode(dto.phone, dto.code);

    const user = await this.usersRepository.findOne({ where: { phoneHash: this.encryption.hmac(dto.phone) } });
    if (!user) {
      throw BusinessException.of('PHONE_NOT_REGISTERED');
    }

    const accessToken = this.generateAccessToken(user.id, user.username, user.role);
    const refreshToken = await this.generateRefreshToken(user);
    await this._createSession(user.id, refreshToken, {
      deviceId: dto.deviceId,
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        phone: this.decryptPhone(user.phone),
        emailVerified: user.emailVerified,
        createdAt: user.createdAt?.toISOString(),
      },
    };
  }

  private async _verifyPhoneCode(phone: string, code: string): Promise<void> {
    const record = await this.phoneCodeRepo.findOne({
      where: { phone, used: false },
      order: { createdAt: 'DESC' },
    });
    if (!record || record.expiresAt < new Date() || record.codeHash !== this.hashToken(code)) {
      throw BusinessException.of('VERIFICATION_CODE_INVALID');
    }
    await this.phoneCodeRepo.update(record.id, { used: true });
  }

  // ─── 自助注销 ────────────────────────────────────────────────────────────

  /**
   * 注销本人账号：密码确认 → 级联清理 → 清全部会话。
   * 不能注销最后一个管理员。
   */
  async deactivateAccount(userId: number, dto: DeactivateAccountDto): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId }, select: { id: true, role: true, password: true } });
    if (!user) return;

    const isAdmin = user.role === UserRole.ADMIN;
    if (isAdmin) {
      const adminCount = await this.usersRepository.count({ where: { role: UserRole.ADMIN } });
      if (adminCount <= 1) {
        throw BusinessException.of('LAST_ADMIN_PROTECTED');
      }
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      await this.delay();
      throw BusinessException.of('INVALID_CREDENTIALS');
    }

    // 级联清理：事件 FK 级联；其余手动删
    await this.sessionRepo.delete({ userId });
    await this.notificationsRepo.delete({ userId });
    await this.todosRepo.delete({ userId });
    await this.pushTokenRepo.delete({ userId });
    const convIds = (await this.conversationRepo.find({ where: { userId: String(userId) }, select: { id: true } })).map((c) => c.id);
    if (convIds.length > 0) {
      await this.aiMessageRepo.createQueryBuilder().delete().where('conversationId IN (:...ids)', { ids: convIds }).execute();
    }
    await this.conversationRepo.delete({ userId: String(userId) });
    await this.opAuditRepo.update({ userId }, { userId: null });
    await this.usersRepository.delete(userId);

    this.logger.log(`Account deactivated: userId=${userId}`);
  }

  // ─── 数据导出 ────────────────────────────────────────────────────────────

  /**
   * 导出本人全量数据（不含登录凭据）。JSON 聚合。
   */
  async exportData(userId: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw BusinessException.of('USER_NOT_FOUND');
    }

    const [events, todos, conversations, notifications] = await Promise.all([
      this.eventsRepo.find({ where: { userId } }),
      this.todosRepo.find({ where: { userId } }),
      this.aiMessageRepo
        .createQueryBuilder('m')
        .leftJoin('ai_conversations', 'c', 'c.id = m.conversationId')
        .where('c.userId = :userId', { userId: String(userId) })
        .select(['m.id', 'm.conversationId', 'm.role', 'm.content', 'm.createdAt'])
        .getMany(),
      this.notificationsRepo.find({ where: { userId } }),
    ]);

    return {
      profile: {
        id: user.id,
        username: user.username,
        email: user.email,
        nickname: user.nickname,
        phone: this.decryptPhone(user.phone),
        role: user.role,
        createdAt: user.createdAt?.toISOString(),
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      },
      events,
      todos,
      conversations,
      notifications,
      aiUsage: {
        totalMessages: conversations.length,
      },
      exportedAt: new Date().toISOString(),
    };
  }

  private async _generateUniqueUsername(base: string): Promise<string> {
    let username = base;
    let attempt = 0;
    while (await this.usersRepository.findOne({ where: { username } })) {
      attempt++;
      const suffix = crypto.randomBytes(3).toString('hex');
      username = `${base.substring(0, 28 - suffix.length - 1)}_${suffix}`;
      if (attempt > 10) {
        // Extremely unlikely but fallback just in case
        username = `user_${crypto.randomBytes(4).toString('hex')}`;
        break;
      }
    }
    return username;
  }
}
