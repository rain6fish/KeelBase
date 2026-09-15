// SPDX-License-Identifier: Apache-2.0

import { Injectable, Optional } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { UserRole } from '../entities/user.entity';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { BUILTIN_ROLE_RULES, RoleRuleSource, type RoleRuleSeed } from './builtin-role-rules';

export type Action =
  | 'manage'
  | 'create'
  | 'read'
  | 'update'
  | 'delete';

/** W5-⑦ Explainable Authz：决策 + 依据（资源级） */
export interface ExplainResult {
  action: string;
  subject: string;
  allowed: boolean;
  reason: string;
  deniedBy: 'casl' | null;
}

/**
 * 宽松的 subject 类型：字符串名（'all'/'User'/'Event'）+ 任意对象。
 * CASL v7 对严格联合类型（含实体类）的 AbilityBuilder 条件推断存在缺陷
 * （MongoQuery<never> / ActionOf never），故采用宽泛类型保证 DSL 可用。
 * 实例校验通过 `subject('User', obj)` 提供 subject 名。
 */
export type AppAbility = MongoAbility<[Action, string | Record<string, any>]>;

/** capability 条目 actions 的规范顺序；`manage` 展开为这四个显式动作（契约见 permission-capability-list.schema.json） */
const EXPANDED_ACTIONS: Action[] = ['create', 'read', 'update', 'delete'];

function normalizeActions(ruleAction: string | string[]): string[] {
  const list = Array.isArray(ruleAction) ? ruleAction : [ruleAction];
  const set = new Set<string>();
  for (const a of list) {
    if (a === 'manage') EXPANDED_ACTIONS.forEach((x) => set.add(x));
    else set.add(a);
  }
  return [...set].sort(
    (a, b) => EXPANDED_ACTIONS.indexOf(a as Action) - EXPANDED_ACTIONS.indexOf(b as Action),
  );
}

@Injectable()
export class CaslAbilityFactory {
  /** 可选注入：数据驱动的规则来源（权限-2 Step 2）。缺席 = 用内置常量（单元测试 / 加载失败）。 */
  constructor(@Optional() private readonly registry?: RoleRuleSource) {}
  /**
   * 该角色的规则来源：**注册表优先（数据驱动），缺席则回退内置常量**。
   * 回退保证两件事：① 单元测试的无参构造 `new CaslAbilityFactory()` 行为不变；
   * ② 注册表加载失败时不至于无人可用（fail-safe 到内置规则，绝不 fail-open 到无规则）。
   */
  private _rulesFor(role: string): RoleRuleSeed[] {
    const fromRegistry = this.registry?.rulesFor(role);
    if (fromRegistry && fromRegistry.length > 0) return fromRegistry;
    return BUILTIN_ROLE_RULES.filter((r) => r.roleCode === role);
  }

  createForUser(user: JwtPayload): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    for (const rule of this._rulesFor(user.role)) {
      if (rule.ownerField == null) {
        can('manage', rule.subject);
        continue;
      }
      const value = rule.stringifyOwner ? String(user.sub) : user.sub;
      can('manage', rule.subject, { [rule.ownerField]: value } as never);
    }

    return build();
  }

  /**
   * W5-⑦ Explainable Authz：把当前用户的能力规则解析为用户可读的「权限清单 + 依据」。
   * 遍历 ability.rules → 提取 subject/scope（all=管理员全量，own=行级所有权条件）。
   */
  describeForUser(user: JwtPayload): {
    role: string;
    basis: string;
    resources: { subject: string; scope: 'all' | 'own'; actions: string[]; reason: string }[];
  } {
    const ability = this.createForUser(user);
    const isAdmin = user.role === UserRole.ADMIN;
    const seen = new Map<
      string,
      { subject: string; scope: 'all' | 'own'; actions: string[]; reason: string }
    >();

    for (const rule of ability.rules) {
      const subjects = (Array.isArray(rule.subject) ? rule.subject : [rule.subject]).filter(
        (s): s is string => typeof s === 'string',
      );
      const actions = normalizeActions(rule.action as unknown as string | string[]);
      for (const s of subjects) {
        if (s === 'all') {
          seen.set('all', {
            subject: 'all',
            scope: 'all',
            actions: normalizeActions('manage'),
            reason: '管理员：可管理全部资源',
          });
          continue;
        }
        const existing = seen.get(s);
        if (existing) {
          // 同一 subject 多条规则 → 能力取并集（capability = 授予的并集）
          existing.actions = normalizeActions([...existing.actions, ...actions]);
          continue;
        }
        const cond = (rule.conditions ?? {}) as Record<string, unknown>;
        const hasOwn =
          cond.userId !== undefined || cond.id !== undefined || cond.requesterId !== undefined;
        seen.set(s, {
          subject: s,
          scope: hasOwn ? 'own' : 'all',
          actions,
          reason: hasOwn ? '只能操作自己的数据（行级所有权条件）' : '可访问（无行级限制）',
        });
      }
    }

    return {
      role: user.role,
      basis: isAdmin
        ? '管理员角色：可管理全部资源'
        : '普通用户：可管理本人拥有的资源（行级所有权条件）',
      resources: [...seen.values()].sort((a, b) => a.subject.localeCompare(b.subject)),
    };
  }

  /**
   * W5-⑦ Explainable Authz：对「某 action × 资源」返回决策 + 依据（资源级；对象级由行级校验承担）。
   * 供 POST /auth/permissions/explain 与管理台 Security Review 排查「为何某用户被拒」。
   */
  /** W5-⑦ 决策解释（本人） */
  explain(user: JwtPayload, action: Action, subjectName: string): ExplainResult {
    return this._explain(user, action, subjectName);
  }

  /**
   * B1：管理员为目标用户反查决策依据（资源级；对象级由行级校验承担）。
   * 只需 role + sub，不要求完整 JwtPayload。
   */
  explainForTarget(user: { role: UserRole; sub: number }, action: Action, subjectName: string): ExplainResult {
    return this._explain(user, action, subjectName);
  }

  private _explain(
    user: { role: UserRole; sub: number },
    action: Action,
    subjectName: string,
  ): ExplainResult {
    const ability = this.createForUser(user as JwtPayload);
    const allowed = ability.can(action, subjectName);
    const isAdmin = user.role === UserRole.ADMIN;
    return {
      action,
      subject: subjectName,
      allowed,
      reason: allowed
        ? subjectName === 'all'
          ? '管理员：可管理全部资源'
          : '可操作（本人所有权范围，行级条件）'
        : isAdmin
          ? '当前策略不允许此操作'
          : '需要管理员权限，或该资源不在你的可管理范围',
      deniedBy: allowed ? null : 'casl',
    };
  }
}
