// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { CaslAbilityFactory, AppAbility } from '../common/casl/casl-ability.factory';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/**
 * D2-2 独立治理台：简化 CASL——治理台只认 admin（can('manage','all')），
 * 去掉主应用的非 admin 业务实体规则（治理台无业务数据，独立产品语义）。
 * extends 基类保持与 PoliciesGuard/@CheckPolicies 的类型兼容。
 */
@Injectable()
export class GovernanceCaslAbilityFactory extends CaslAbilityFactory {
  override createForUser(user: JwtPayload): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
    if (user.role === 'admin') can('manage', 'all');
    return build();
  }
}
