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
  /**
   * CASL actions this rule grants. **Omitted = `['manage']`** — which is what every seed meant before
   * this field existed, so leaving it out is not a behaviour change for any existing rule. Granting
   * *less* than `manage` is the only way a read-only role can be expressed at all.
   *
   * 本规则授予的 CASL 动作。**省略 = `['manage']`** —— 这正是本字段出现之前每一条种子的含义，
   * 所以「不写」对既有规则不是行为变化。而**授予得比 `manage` 少**，正是**只读角色得以表达**的唯一方式。
   */
  actions?: string[];
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
  // Audit reader (AW-2, widened one surface at a time): read-only, and only on the audit / governance
  // read surfaces enumerated here. This list IS the role's reach — everything it can touch is named
  // here, and `PoliciesGuard` denies by default. It deliberately gets none of the `USER` ownership
  // rules: the role is a reader of the governance record, not a user of the application. Every rule
  // grants `read` and nothing else; none of them may grow a write action, or the role silently stops
  // being an auditor.
  //
  // 审计读者（AW-2，**一面一面地放宽**）：只读，且只在下面列尽的审计 / 治理读面上。**这份清单就是该角色
  // 能碰到的全部** —— 其余由 `PoliciesGuard` 默认拒绝。它**有意**不拿任何 `USER` 的所有权规则：这个角色
  // 是治理记录的**读者**，不是应用的**用户**。每条规则都只授予 `read`；任何一条日后都不许长出写动作，
  // 否则它就不再是审计读者。
  { roleCode: UserRole.AUDITOR, subject: 'AuditLog', actions: ['read'], ownerField: null },
  // Operations audit (`GET /audit/operations/logs|verify|stats`): business writes, including the ones
  // no AI took part in. Same subject name as the Java runtime's `GovernanceReadSubjects.OPERATION_AUDIT`
  // (JV-63), so an audit reader reads the same face on both sides. All three endpoints are reads —
  // verification recomputes the chain and stats aggregates it — and none of them is widened further.
  // 操作审计（`GET /audit/operations/logs|verify|stats`）：业务写，包括**没有 AI 参与**的那些。subject
  // 名与 Java 运行时的 `GovernanceReadSubjects.OPERATION_AUDIT`（JV-63）相同，使审计读者在两侧读到**同一面**。
  // 三个端点都是读 —— 校验重算哈希链、统计做聚合 —— 都不再向外放宽。
  { roleCode: UserRole.AUDITOR, subject: 'OperationAudit', actions: ['read'], ownerField: null },
  // Governance policy and its revision history (`GET /ai/governance/policy[/history[/:revision]]`).
  // Reading the rule set is audit work; changing it (`PUT`, `apply-preset`) stays admin-only.
  // 治理策略及其版本历史（`GET /ai/governance/policy[/history[/:revision]]`）。读规则集是审计工作；
  // 改它（`PUT`、`apply-preset`）仍是管理员专属。
  { roleCode: UserRole.AUDITOR, subject: 'GovernancePolicy', actions: ['read'], ownerField: null },
  // Tool inventory (`GET /ai/tools`): what the agent can call and at what risk — the surface the audit
  // vocabulary gate itself reads.
  // 工具清单（`GET /ai/tools`）：Agent 能调用什么、处在什么风险级 —— 审计词表闸自己读的就是这一面。
  { roleCode: UserRole.AUDITOR, subject: 'ToolInventory', actions: ['read'], ownerField: null },
  // R4 approval queue, read side (`GET /ai/confirmations/pending|decided`). Approving, deciding and
  // retrying execution stay admin-only: this grants reading the queue, not resolving it.
  // R4 审批队列的读侧（`GET /ai/confirmations/pending|decided`）。批准、裁决、重试执行仍是管理员专属：
  // 这里授予的是**读队列**，不是**处理队列**。
  { roleCode: UserRole.AUDITOR, subject: 'ApprovalQueue', actions: ['read'], ownerField: null },
];
