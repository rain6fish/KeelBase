// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { UserRole } from '../entities/user.entity';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

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

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: JwtPayload): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    if (user.role === UserRole.ADMIN) {
      can('manage', 'all');
    } else {
      can('manage', 'User', { id: user.sub });
      can('manage', 'Event', { userId: user.sub });
      can('manage', 'Todo', { userId: user.sub });
      // 注：组织级共享（同组织成员可读/管理待办）在 TodosService 层用 orgService 校验
      // （JWT payload 不含 orgId，无法在此表达），此处保持本人所有权规则。
      // AiConversation.userId 是 string UUID，JWT sub 是 number → 需转换
      can('manage', 'AiConversation', { userId: String(user.sub) });
      can('manage', 'UserMemory', { userId: String(user.sub) });
      // AI CRM 旗舰应用：客户/订单/跟进/任务/风险 本人所有权
      can('manage', 'CrmCustomer', { userId: user.sub });
      can('manage', 'CrmOrder', { userId: user.sub });
      can('manage', 'CrmActivity', { userId: user.sub });
      can('manage', 'CrmTask', { userId: user.sub });
      can('manage', 'CrmRisk', { userId: user.sub });
      // AI Project Management 旗舰应用：项目/成员/里程碑/任务/风险 本人所有权
      can('manage', 'PmProject', { userId: user.sub });
      can('manage', 'PmMember', { userId: user.sub });
      can('manage', 'PmMilestone', { userId: user.sub });
      can('manage', 'PmTask', { userId: user.sub });
      can('manage', 'PmRisk', { userId: user.sub });
      // AI Approval 旗舰应用：审批请求/政策 本人所有权
      can('manage', 'ApprovalRequest', { requesterId: user.sub });
      can('manage', 'ApprovalPolicy', { userId: user.sub });
      // keelbase init 生成模块（wireBackend 自动接线，勿手改：wire.mjs 会追加）
      can('manage', 'Supplier', { userId: user.sub });
      can('manage', 'Contract', { userId: user.sub });
      // 早期生成模块（wire 当时未追加，手动补）：本人可管理（否则编辑/删除恒 403）
      can('manage', 'Book', { userId: user.sub });
      can('manage', 'Tag', { userId: user.sub });
      can('manage', 'Note', { userId: user.sub });
      can('manage', 'Post', { userId: user.sub });
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
    resources: { subject: string; scope: 'all' | 'own'; reason: string }[];
  } {
    const ability = this.createForUser(user);
    const isAdmin = user.role === UserRole.ADMIN;
    const seen = new Map<string, { subject: string; scope: 'all' | 'own'; reason: string }>();

    for (const rule of ability.rules) {
      const subjects = (Array.isArray(rule.subject) ? rule.subject : [rule.subject]).filter(
        (s): s is string => typeof s === 'string',
      );
      for (const s of subjects) {
        if (s === 'all') {
          seen.set('all', { subject: 'all', scope: 'all', reason: '管理员：可管理全部资源' });
          continue;
        }
        if (seen.has(s)) continue;
        const cond = (rule.conditions ?? {}) as Record<string, unknown>;
        const hasOwn =
          cond.userId !== undefined || cond.id !== undefined || cond.requesterId !== undefined;
        seen.set(s, {
          subject: s,
          scope: hasOwn ? 'own' : 'all',
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
