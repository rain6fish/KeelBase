// SPDX-License-Identifier: Apache-2.0

import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CaslAbilityFactory } from './casl-ability.factory';
import { RoleRuleSource } from './builtin-role-rules';
import { RoleRuleRegistry } from '../../authz/role-rule-registry.service';
import { Role } from '../../authz/entities/role.entity';
import { Permission } from '../../authz/entities/permission.entity';
import { RolePermission } from '../../authz/entities/role-permission.entity';

/**
 * `@Global()`：CASL 能力工厂被广泛注入（guards / services / AI）。
 *
 * 权限-2 Step 2 起，规则来源是**数据驱动**的：`RoleRuleRegistry` 在 `onModuleInit` 载入
 * `roles` / `permissions` / `role_permissions`（+ 生成模块的代码规则）到内存，工厂同步读取。
 * 只依赖这三张表、**不依赖 OrgModule 等业务模块**——避免把全局模块拖进业务模块的依赖环。
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission, RolePermission])],
  providers: [
    CaslAbilityFactory,
    RoleRuleRegistry,
    { provide: RoleRuleSource, useExisting: RoleRuleRegistry },
  ],
  exports: [CaslAbilityFactory, RoleRuleSource, RoleRuleRegistry],
})
export class CaslModule {}
