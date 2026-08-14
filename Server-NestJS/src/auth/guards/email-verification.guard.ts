import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SKIP_EMAIL_VERIFICATION_KEY } from './skip-email-verification.decorator';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { BusinessException } from '../../common/errors/business.exception';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * 邮箱验证守卫：已登录用户执行写操作前要求邮箱已验证（emailVerified）。
 * - GET / @Public / @SkipEmailVerification / 无 user 放行
 * - admin 视为已验证（避免锁死管理操作）
 * - 未验证 → 403（提示去验证邮箱）
 */
@Injectable()
export class EmailVerificationGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_EMAIL_VERIFICATION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    if (!WRITE_METHODS.has(method)) return true;

    const user = req.user as JwtPayload | undefined;
    if (!user) return true; // 未登录（JwtAuthGuard 处理）

    if (user.role === 'admin') return true; // admin 视为已验证

    const dbUser = await this.usersService.findOne(user.sub);
    if (dbUser && !dbUser.emailVerified) {
      throw BusinessException.of('EMAIL_NOT_VERIFIED');
    }
    return true;
  }
}
