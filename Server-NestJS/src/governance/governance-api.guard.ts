// SPDX-License-Identifier: Apache-2.0

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * D2-3 治理台服务身份：业务系统接入治理台的上报/下发端点认证。
 * 共享 GOVERNANCE_API_KEY（业务系统配置同 key），x-api-key 或 Authorization Bearer 校验。
 * 用服务密钥而非用户 JWT——业务系统服务端到服务端接入，不依赖用户会话。
 */
@Injectable()
export class GovernanceApiGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const headerKey: string | undefined = req.headers['x-api-key'];
    const bearerKey: string | undefined =
      typeof req.headers.authorization === 'string'
        ? req.headers.authorization.replace(/^Bearer\s+/i, '')
        : undefined;
    const presented = headerKey ?? bearerKey;
    const expected = process.env.GOVERNANCE_API_KEY || '';
    if (!expected || presented !== expected) {
      throw new UnauthorizedException('治理台服务身份无效（GOVERNANCE_API_KEY）');
    }
    return true;
  }
}
