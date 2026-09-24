// SPDX-License-Identifier: Apache-2.0

/**
 * 委托 token（AI Bridge §5 身份/权限桥接）：Java 会话 → KeelBase 用户作用域。
 *
 * KeelBase 用户（已 JWT 认证）请求签发短期委托 JWT，供 B 路径 ProxyTool 调
 * 已有系统（Java/Spring）REST 端点时携带；Java 端共享 DELEGATION_SECRET 验签，
 * 用 `oidcSub`（OIDC subject）或 `local:<userId>` 映射本地用户。
 *
 * 安全要点：
 *  - 独立密钥 DELEGATION_SECRET（缺省回退 JWT_SECRET，但生产应显式配置）
 *  - 短时有效（默认 300s）+ audience 限定目标系统（防跨系统冒用）
 *  - 仅签发「已认证用户 → 委托身份」，不做提权（Java 端按 subject 自身权限判断）
 */
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../common/entities/user.entity';

export interface DelegationPayload {
  sub: string; // KeelBase userId
  oidcSub?: string; // OIDC subject（统一身份源映射键）
  aud: string; // 目标系统 audience
  iss: 'keelbase';
  iat?: number;
  exp?: number;
}

/**
 * 目标系统标识（audience）的合法形状——与 wire `delegation-token-claims.schema.json` 的 `aud.pattern` 单一源。
 *
 * 导出它是因为**不止一处**需要判「这是不是一个能用的目的地」：签发时要拒（否则签出无人认得的 token），
 * 代理工具注册时也要拒（否则该工具的目的地会超出确认行能存的长度，见 `ProxyToolRegistryService`）。
 * 两处各写一个正则，就会漂移成「签发拒了、注册没拒」这种半开状态。
 */
export const AUDIENCE_PATTERN = /^[\w.:-]{1,64}$/;

/** 是否为合法的目标系统标识（形状见 `AUDIENCE_PATTERN`）。 */
export function isValidAudience(value: unknown): value is string {
  return typeof value === 'string' && AUDIENCE_PATTERN.test(value);
}

@Injectable()
export class DelegationTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  private get secret(): string {
    return (
      this.configService.get<string>('DELEGATION_SECRET') ||
      this.configService.get<string>('JWT_SECRET', '')
    );
  }

  /** 签发委托 JWT。audience = 目标系统标识（如 'legacy-erp'）；subject = OIDC subject 或 local:<userId>。 */
  async sign(
    userId: string,
    audience: string,
    ttlSeconds = 300,
  ): Promise<{ token: string; subject: string; expiresIn: number; userId: string; audience: string }> {
    if (!isValidAudience(audience)) {
      throw new BadRequestException('audience 必填且仅限字母数字/点/冒号/连字符（≤64）');
    }
    const ttl = Number.isFinite(ttlSeconds) && ttlSeconds >= 60 && ttlSeconds <= 3600 ? ttlSeconds : 300;
    const user = await this.usersRepo.findOne({ where: { id: Number(userId) } });
    const oidcSub = user?.providerId || undefined;
    const subject = oidcSub ?? `local:${userId}`;

    // JWT sub 与响应 subject 一致（oidcSub 或 local:<userId>），Java 端按文档直接映射本地用户（原 sub 裸 userId 无前缀）
    const jwtSub = oidcSub ?? `local:${userId}`;
    const token = this.jwtService.sign(
      { sub: jwtSub, oidcSub, aud: audience, iss: 'keelbase' },
      { secret: this.secret, expiresIn: `${ttl}s` },
    );
    return { token, subject, expiresIn: ttl, userId, audience };
  }

  /** 验证委托 JWT（Java 端用共享 DELEGATION_SECRET 验签；KeelBase 侧可经此校验）。 */
  verify(token: string, expectedAudience?: string): DelegationPayload {
    let payload: DelegationPayload;
    try {
      payload = this.jwtService.verify(token, { secret: this.secret });
    } catch {
      throw new UnauthorizedException('委托 token 无效或已过期');
    }
    if (expectedAudience && payload.aud !== expectedAudience) {
      throw new UnauthorizedException('委托 token audience 不匹配');
    }
    return payload;
  }
}
