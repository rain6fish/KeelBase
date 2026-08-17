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
    }

    return build();
  }
}
