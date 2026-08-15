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
    }

    return build();
  }
}
