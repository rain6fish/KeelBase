// SPDX-License-Identifier: Apache-2.0

import { UserRole } from '../entities/user.entity';

/**
 * 内置角色规则（**单一来源**）。
 *
 * 用途双份：
 * ① **迁移种子**——`1820000000000-AddRolesPermissions` 据此写入 `roles` / `permissions` / `role_permissions`；
 * ② **回退**——`RoleRuleRegistry` 缺席时（如单元测试的无参构造 `new CaslAbilityFactory()`）工厂直接用它。
 *
 * 顺序与内容必须与改造前的硬编码规则逐条一致——`describeForUser` 的输出受 PC-1 冻结门禁保护。
 */
export interface RoleRuleSeed {
  roleCode: string;
  /** CASL subject；`'all'` = 无行级限制（管理员） */
  subject: string;
  /** 行级条件字段名；`null` = 无 conditions（管理员 manage all） */
  ownerField: string | null;
  /** 条件值是否转字符串（AiConversation / UserMemory 的 userId 是 UUID 字符串，JWT sub 是 number） */
  stringifyOwner?: boolean;
}

/**
 * 规则来源抽象（DI token）。
 * 工厂依赖这个**抽象类**而非具体注册表服务——实现可换（DB 注册表 / 测试替身），
 * 且缺席时工厂自动回退 `BUILTIN_ROLE_RULES`。
 */
export abstract class RoleRuleSource {
  abstract rulesFor(roleCode: string): RoleRuleSeed[];
  /** 角色对某主体的数据范围级别；未配置 → undefined（调用方回退内置默认） */
  abstract dataScopeFor(roleCode: string, subject: string): string | undefined;
  /** 角色的自定义部门集（`data_scope = custom_dept`） */
  abstract customDeptIdsFor(roleCode: string): number[] | null;
}

export const BUILTIN_ROLE_RULES: RoleRuleSeed[] = [
  { roleCode: UserRole.ADMIN, subject: 'all', ownerField: null },
  { roleCode: UserRole.USER, subject: 'User', ownerField: 'id' },
  { roleCode: UserRole.USER, subject: 'Event', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'Todo', ownerField: 'userId' },
  // 注：组织级共享（同组织成员可读/管理待办）在 TodosService 层用 orgService 校验
  // （JWT payload 不含 orgId，无法在 CASL 表达），此处保持本人所有权规则。
  { roleCode: UserRole.USER, subject: 'AiConversation', ownerField: 'userId', stringifyOwner: true },
  { roleCode: UserRole.USER, subject: 'UserMemory', ownerField: 'userId', stringifyOwner: true },
  // AI CRM 旗舰应用：客户/订单/跟进/任务/风险 本人所有权
  { roleCode: UserRole.USER, subject: 'CrmCustomer', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'CrmOrder', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'CrmActivity', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'CrmTask', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'CrmRisk', ownerField: 'userId' },
  // AI Project Management 旗舰应用：项目/成员/里程碑/任务/风险 本人所有权
  { roleCode: UserRole.USER, subject: 'PmProject', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'PmMember', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'PmMilestone', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'PmTask', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'PmRisk', ownerField: 'userId' },
  // AI Approval 旗舰应用：审批请求/政策 本人所有权
  { roleCode: UserRole.USER, subject: 'ApprovalRequest', ownerField: 'requesterId' },
  { roleCode: UserRole.USER, subject: 'ApprovalPolicy', ownerField: 'userId' },
  // 生成模块：Supplier/Contract 由 `keelbase init` 接线；Book/Tag/Note/Post 为早期生成模块（手动补）
  { roleCode: UserRole.USER, subject: 'Supplier', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'Contract', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'Book', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'Tag', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'Note', ownerField: 'userId' },
  { roleCode: UserRole.USER, subject: 'Post', ownerField: 'userId' },
];
