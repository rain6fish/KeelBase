// SPDX-License-Identifier: Apache-2.0

import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../common/entities/user.entity';
import { OrgService } from '../org/org.service';
import { RoleRuleSource } from '../common/casl/builtin-role-rules';
import { defaultScopeDescriptor } from '../common/scope/scope-policy';
import type { ScopeDescriptor, ScopeLevel } from '../common/scope/scope.types';

/**
 * 数据范围解析（权限-2 Step 2）：把「角色配置的数据范围」翻成 `ScopeDescriptor`。
 *
 * **放置说明**：本服务由 `OrgModule` 提供（不是新开 AuthzModule）。原因：它只需要
 * `User` 仓储 + `OrgService`（都在 OrgModule）+ 全局 `CaslModule` 的 `RoleRuleSource`；
 * 放进 OrgModule 使 Todos/Events **无需改模块接线**，也**不引入新的循环依赖**
 * （OrgModule→FlowsModule→AiModule→TodosModule 这条链已存在）。
 *
 * 回退：`RoleRuleSource` 缺席或该角色未配置范围 → `defaultScopeDescriptor`（内置默认，逐 subject
 * 复刻改造前的行为）。**绝不 fail-open**：配置缺失只会退回更紧的默认，不会放开。
 */
@Injectable()
export class DataScopeService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly org: OrgService,
    @Optional() private readonly rules?: RoleRuleSource,
  ) {}

  async resolve(userId: number, subject: string): Promise<ScopeDescriptor> {
    const ctx = await this.org.getUserOrgContext(userId);

    const configured = await this._configuredLevel(userId, subject);
    if (!configured) return defaultScopeDescriptor(userId, subject, ctx);

    const level = configured as ScopeLevel;
    const deptSubtreeIds =
      level === 'own_dept_and_below' && ctx?.deptId != null
        ? await this.org.listDeptSubtreeIds(ctx.orgId, ctx.deptId)
        : [];
    const customDeptIds =
      level === 'custom_dept' ? ((await this._customDeptIds(userId)) ?? []) : undefined;

    return {
      userId,
      orgId: ctx?.orgId ?? null,
      deptId: ctx?.deptId ?? null,
      level,
      deptSubtreeIds,
      customDeptIds,
    };
  }

  /** 用户角色 → 该角色对 subject 的数据范围级别；未配置/无来源 → undefined */
  private async _configuredLevel(userId: number, subject: string): Promise<string | undefined> {
    if (!this.rules) return undefined;
    const roleCode = await this._roleCode(userId);
    return this.rules.dataScopeFor(roleCode, subject);
  }

  private async _customDeptIds(userId: number): Promise<number[] | null> {
    if (!this.rules) return null;
    return this.rules.customDeptIdsFor(await this._roleCode(userId));
  }

  /** 角色 code：以 `users.role` 为准（枚举仍是事实来源；user_roles 是它的表侧镜像） */
  private async _roleCode(userId: number): Promise<string> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, role: true },
    });
    return user?.role ?? UserRole.USER;
  }
}
