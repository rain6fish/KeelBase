import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagsService } from './feature-flags.service';
import { FEATURE_KEY_METADATA, FeatureKey } from './feature-flags.constants';

/**
 * 特性开关守卫：标注 @FeatureFlag(key) 的控制器/端点在该特性关闭时返回 404。
 * 用 404 而非 403，避免向客户端暴露功能存在与否。
 */
@Injectable()
export class FeatureDisabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const key = this.reflector.getAllAndOverride<FeatureKey | undefined>(FEATURE_KEY_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!key) return true;
    if (this.featureFlags.isEnabled(key)) return true;
    throw new NotFoundException('接口不存在');
  }
}
