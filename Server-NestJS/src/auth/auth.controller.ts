import { Controller, Post, Get, Delete, Body, Headers, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { ParseIntPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiCreatedResponse, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OAuthProvidersConfigService } from './oauth-providers.config';
import { CaslAbilityFactory } from '../common/casl/casl-ability.factory';
import { LoginDto } from './dto/login.dto';
import { MfaVerifyDto, MfaDisableDto } from './dto/mfa.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
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
import { Public } from './guards/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import { SkipMaintenance } from '../settings/skip-maintenance.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private authService: AuthService,
    private providersConfig: OAuthProvidersConfigService,
    private caslFactory: CaslAbilityFactory,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Register new user' })
  @ApiCreatedResponse({ description: 'Registration successful' })
  async register(
    @Body() dto: RegisterDto,
    @Headers('x-device-id') deviceId?: string,
    @Req() req?: Request,
  ) {
    return this.authService.register(dto, {
      deviceId: deviceId || undefined,
      ip: req?.ip,
      userAgent: req?.headers['user-agent'],
    });
  }

  @Public()
  @SkipMaintenance()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Login with username and password' })
  @ApiOkResponse({ description: 'Login successful' })
  async login(
    @Body() dto: LoginDto,
    @Headers('x-device-id') deviceId?: string,
    @Req() req?: Request,
  ) {
    dto.deviceId = deviceId || '';
    return this.authService.login(dto, {
      ip: req?.ip,
      userAgent: req?.headers['user-agent'],
    });
  }

  @Public()
  @FeatureFlag('oauth')
  @Post('oauth')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Login via OAuth provider (Google/Apple/WeChat/Alipay/QQ) — auto-creates account if new' })
  @ApiOkResponse({ description: 'OAuth login successful' })
  async oauthLogin(
    @Body() dto: OAuthLoginDto,
    @Headers('x-device-id') deviceId?: string,
    @Req() req?: Request,
  ) {
    return this.authService.oAuthLogin(dto, {
      deviceId: deviceId || undefined,
      ip: req?.ip,
      userAgent: req?.headers['user-agent'],
    });
  }

  @Public()
  @FeatureFlag('oauth')
  @Get('oauth/providers')
  @ApiOperation({ summary: 'Get list of enabled OAuth providers with metadata' })
  @ApiOkResponse({ description: 'Provider list returned' })
  async getProviders() {
    return this.providersConfig.getConfig();
  }

  @Public()
  @SkipMaintenance()
  @Post('refresh')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiOkResponse({ description: 'Token refreshed' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Public()
  @Post('forgot-password')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Request password reset email (anti-enumeration: uniform response)' })
  @ApiOkResponse({ description: 'Reset link sent if email registered' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Reset password with token from email link' })
  @ApiOkResponse({ description: 'Password reset successful' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Post('verify-email')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Verify email with 6-digit code' })
  @ApiOkResponse({ description: 'Email verified' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Post('resend-verification')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Resend email verification code (uniform response, anti-enumeration)' })
  @ApiOkResponse({ description: 'Code resent if email registered' })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Public()
  @FeatureFlag('sms')
  @Post('send-sms-code')
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Send SMS verification code (uniform response, anti-enumeration)' })
  async sendSmsCode(@Body() dto: SendSmsCodeDto) {
    return this.authService.sendSmsCode(dto);
  }

  @Public()
  @FeatureFlag('sms')
  @Post('login-phone')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Login with phone + SMS code' })
  async loginPhone(
    @Body() dto: LoginPhoneDto,
    @Headers('x-device-id') deviceId?: string,
    @Req() req?: Request,
  ) {
    dto.deviceId = deviceId || dto.deviceId;
    return this.authService.loginPhone(dto, {
      ip: req?.ip,
      userAgent: req?.headers['user-agent'],
    });
  }

  @Post('bind-phone')
  @FeatureFlag('sms')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bind/update phone number with SMS code' })
  async bindPhone(@CurrentUser() user: JwtPayload, @Body() dto: BindPhoneDto) {
    return this.authService.bindPhone(user.sub, dto);
  }

  @Post('deactivate')
  @HttpCode(HttpStatus.OK)
  @SkipAudit()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate (delete) own account with password confirmation' })
  async deactivate(@CurrentUser() user: JwtPayload, @Body() dto: DeactivateAccountDto) {
    await this.authService.deactivateAccount(user.sub, dto);
    return null;
  }

  @Get('export-data')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export own full data as JSON (data portability)' })
  async exportData(@CurrentUser() user: JwtPayload) {
    return this.authService.exportData(user.sub);
  }

  @Get('invite')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'G-2 我的邀请信息：邀请码 + 已邀请用户列表' })
  async getInvite(@CurrentUser() user: JwtPayload) {
    return this.authService.getInviteInfo(user.sub);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({ description: 'Profile retrieved' })
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  @Get('me/permissions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Explainable authorization: current user capability list with basis' })
  @ApiOkResponse({ description: 'Permission capability list' })
  async getMyPermissions(@CurrentUser() user: JwtPayload) {
    return this.caslFactory.describeForUser(user);
  }

  @Post('permissions/explain')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Explainable authorization: decision + basis for action×resource' })
  @ApiOkResponse({ description: 'Permission decision with basis' })
  async explainPermission(
    @CurrentUser() user: JwtPayload,
    @Body() body: { action: string; subject: string },
  ) {
    return this.caslFactory.explain(
      user,
      body.action as 'manage' | 'create' | 'read' | 'update' | 'delete',
      body.subject,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current device (revoke its sessions)' })
  @ApiOkResponse({ description: 'Logged out' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Headers('x-device-id') deviceId?: string,
  ) {
    await this.authService.logout(user.sub, deviceId || undefined);
    return null;
  }

  @Post('mfa/setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'WEB-FRONT-4 MFA：生成 TOTP secret + otpauth URL（未启用）' })
  async mfaSetup(@CurrentUser() user: JwtPayload) {
    return this.authService.mfaSetup(user.sub, user.username);
  }

  @Post('mfa/verify')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'WEB-FRONT-4 MFA：验证绑定 code 并启用' })
  async mfaVerify(@CurrentUser() user: JwtPayload, @Body() dto: MfaVerifyDto) {
    return this.authService.mfaVerify(user.sub, dto.secret, dto.code);
  }

  @Post('mfa/disable')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'WEB-FRONT-4 MFA：停用（需正确 TOTP code 确认）' })
  async mfaDisable(@CurrentUser() user: JwtPayload, @Body() dto: MfaDisableDto) {
    return this.authService.mfaDisable(user.sub, dto.code);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'WEB-FRONT-4：登录后修改密码（校验当前密码，清除强制改密标志）' })
  async changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List current user login sessions/devices' })
  @ApiOkResponse({ description: 'Session list returned' })
  async getSessions(
    @CurrentUser() user: JwtPayload,
    @Headers('x-device-id') deviceId?: string,
  ) {
    return this.authService.getSessions(user.sub, deviceId || undefined);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a session (remote logout)' })
  @ApiOkResponse({ description: 'Session revoked' })
  async revokeSession(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.authService.revokeSession(user.sub, id);
    return null;
  }
}
