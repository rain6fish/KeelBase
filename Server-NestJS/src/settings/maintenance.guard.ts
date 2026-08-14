import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SettingsService } from './settings.service';
import { BusinessException } from '../common/errors/business.exception';
import { SKIP_MAINTENANCE_KEY } from './skip-maintenance.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/**
 * 维护模式守卫（RG-2）：Settings 里 maintenance_mode=true 时，
 * 仅放行 admin 与 @SkipMaintenance 端点（如健康检查/登录），其余返回 503。
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_MAINTENANCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    if (!(await this.settings.isMaintenanceMode())) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as JwtPayload | undefined;
    if (user?.role === 'admin') return true;

    throw new BusinessException('MAINTENANCE_MODE');
  }
}
