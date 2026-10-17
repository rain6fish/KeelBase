// SPDX-License-Identifier: Apache-2.0

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from './casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from './check-policies.decorator';
import { UserRole } from '../entities/user.entity';
import {
  buildDenialExplanation,
  pickLanguageFromHeader,
} from '../errors/denial-guidance';

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
      // W5-⑦ Explainable Authz：403 附「为何阻止」依据（前端可展示）。
      // Trust-grade errors：同一 `explanation` 形状再带 reasonKey / nextStepKey / params，
      // 按 Accept-Language 给出本地化文案 —— 客户端可自行翻译，也可直接展示。
      //
      // W5-⑦ Explainable Authz: the 403 carries "why" (frontend can render it). Trust-grade errors
      // extend the same `explanation` object with reasonKey / nextStepKey / params and localized text,
      // so a client can either translate the keys itself or display the text as-is.
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Forbidden resource',
        explanation: buildDenialExplanation(
          user.role === UserRole.ADMIN ? 'casl_admin' : 'casl_user',
          { role: user.role ?? 'none' },
          pickLanguageFromHeader(request.headers?.['accept-language']),
        ),
      });
    }

    return true;
  }
}
