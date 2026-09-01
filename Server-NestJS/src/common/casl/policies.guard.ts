// SPDX-License-Identifier: Apache-2.0

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from './casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from './check-policies.decorator';
import { UserRole } from '../entities/user.entity';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private abilityFactory: CaslAbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { user } = request;

    // @Public() 路由无 user，跳过授权
    if (!user) {
      return true;
    }

    // 构建能力并挂到 request，供 @CurrentAbility() 使用
    const ability = this.abilityFactory.createForUser(user);
    request.ability = ability;

    const handlers = this.reflector.getAllAndOverride<PolicyHandler[]>(
      CHECK_POLICIES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!handlers || handlers.length === 0) {
      return true;
    }

    if (!handlers.every((handler) => handler(ability))) {
      // W5-⑦ Explainable Authz：403 附「为何阻止」依据（前端可展示）
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Forbidden resource',
        explanation: {
          deniedBy: 'casl',
          reason:
            user.role === UserRole.ADMIN
              ? '当前策略不允许此操作'
              : '需要管理员权限，或该操作不在你的角色范围内',
        },
      });
    }

    return true;
  }
}
