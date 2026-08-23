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
    if (!audience || !/^[\w.:-]{1,64}$/.test(audience)) {
      throw new BadRequestException('audience 必填且仅限字母数字/点/冒号/连字符（≤64）');
    }
    const ttl = Number.isFinite(ttlSeconds) && ttlSeconds >= 60 && ttlSeconds <= 3600 ? ttlSeconds : 300;
    const user = await this.usersRepo.findOne({ where: { id: Number(userId) } });
    const oidcSub = user?.providerId || undefined;
    const subject = oidcSub ?? `local:${userId}`;

    const token = this.jwtService.sign(
      { sub: userId, oidcSub, aud: audience, iss: 'keelbase' },
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
