// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { RoleRuleSource, type RoleRuleSeed } from '../common/casl/builtin-role-rules';
import { GENERATED_ROLE_RULES } from './generated-role-rules';

/**
 * 角色规则注册表（权限-2 Step 2）：把 `roles` / `role_permissions` / `permissions`
 * 在装配时载入内存，提供**同步**读取——`CaslAbilityFactory.createForUser` 因此保持同步，
 * 全部既有调用点与 spec 无需改动。
 *
 * 刷新：角色或授予变更后调用 `reload()`（本步无管理端，由迁移/维护脚本触发）。
 * 失败策略：`reload` 失败**不抛**（装配不因治理数据缺失而中断），`rulesFor` 返回空 →
 * 工厂回退 `BUILTIN_ROLE_RULES`（fail-safe 到内置规则，绝不 fail-open 到无规则）。
 */
@Injectable()
export class RoleRuleRegistry extends RoleRuleSource implements OnModuleInit {
  private readonly logger = new Logger(RoleRuleRegistry.name);
  private rulesByRole = new Map<string, RoleRuleSeed[]>();
  private roleByCode = new Map<string, Role>();
  /** `${roleCode}:${subject}` → data_scope 覆盖 */
  private scopeOverrides = new Map<string, string>();

  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly grants: Repository<RolePermission>,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.reload();
    } catch (err) {
      this.logger.warn(`角色规则注册表载入失败，将回退内置规则：${String(err)}`);
    }
  }

  /** 重新载入（角色/授予变更后调用）。 */
  async reload(): Promise<void> {
    const roles = await this.roles.find();
    const grants = await this.grants.find({ relations: { permission: true } });

    const rules = new Map<string, RoleRuleSeed[]>();
    const overrides = new Map<string, string>();
    for (const role of roles) rules.set(role.code, []);

    for (const g of grants) {
      const role = roles.find((r) => r.id === g.roleId);
      const subject = g.permission?.subject;
      if (!role || !subject) continue;
      rules.get(role.code)!.push({
        roleCode: role.code,
        subject,
        ownerField: g.ownerField ?? null,
        stringifyOwner: g.stringifyOwner,
      });
      if (g.dataScope) overrides.set(`${role.code}:${subject}`, g.dataScope);
    }

    // 生成模块规则（代码即配置）并入；同 subject 已在 DB 中则不重复
    for (const r of GENERATED_ROLE_RULES) {
      const list = rules.get(r.roleCode) ?? [];
      if (!list.some((x) => x.subject === r.subject)) list.push(r);
      rules.set(r.roleCode, list);
    }

    this.rulesByRole = rules;
    this.roleByCode = new Map(roles.map((r) => [r.code, r]));
    this.scopeOverrides = overrides;
  }

  rulesFor(roleCode: string): RoleRuleSeed[] {
    return this.rulesByRole.get(roleCode) ?? [];
  }

  /** 角色对某主体的数据范围级别：按主体覆盖优先，其次角色默认。未配置 → undefined（调用方回退内置默认）。 */
  dataScopeFor(roleCode: string, subject: string): string | undefined {
    return (
      this.scopeOverrides.get(`${roleCode}:${subject}`) ?? this.roleByCode.get(roleCode)?.dataScope
    );
  }

  /** 角色的自定义部门集（`data_scope = custom_dept`）。 */
  customDeptIdsFor(roleCode: string): number[] | null {
    return this.roleByCode.get(roleCode)?.customDeptIds ?? null;
  }
}
