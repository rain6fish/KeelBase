// SPDX-License-Identifier: Apache-2.0

/**
 * REV-16: which tables reference a revocable target — the derived-edge registry.
 *
 * The revoke verdict reads two things, `revoke_status` and the target's soft-delete mark, and neither of
 * them knows anything about rows **derived from** the target. Compensating a project therefore soft-deletes
 * it while milestones, risks and members added to it afterwards keep pointing at it — and the verdict still
 * reads complete. Reversing a write set is not reversing downstream state.
 *
 * This file is the part of that gap that can be answered without inventing anything: the reference edges
 * that actually exist. Membership is decided by the schema, not by a guess — an edge goes in when the
 * referencing entity carries a real relation column for the target (`@Column` + `@JoinColumn`), which is
 * how `pm_*` points at `pm_projects`. Types whose references were checked and found to be none carry an
 * **empty list**, so the two answers stay apart: an empty list is "checked, nothing points at it", while a
 * type **absent** from this registry has no reference model at all and is reported as **not checked**
 * rather than as clean (`countDerivedReferences` returns null for those).
 *
 * REV-16：哪些表引用了可撤销的目标 —— 派生边登记表。
 *
 * 撤销判定只读两样东西，`revoke_status` 与目标的软删标记，而两者都不知道**派生自**目标的行。于是补偿一个
 * 项目会软删它，而之后给它加的里程碑、风险、成员仍指着它 —— 判定照读完成。反转一次写集，不等于反转下游状态。
 *
 * 本文件是这个缺口里**不必凭空发明**的那一半：真实存在的引用边。是否收录由 schema 决定、不靠猜 —— 只有当
 * 引用方实体对该目标带**真关系列**（`@Column` + `@JoinColumn`）时才收录，`pm_*` 指向 `pm_projects` 正是如此。
 * 核过且确认无人引用的类型带**空列表**，两种答案因此分开：空列表是「查过、没有东西指着它」，而**不在此表**
 * 的类型根本没有引用模型，会被报成**未检查**而不是干净（`countDerivedReferences` 对它们返回 null）。
 */
export interface DerivedReference {
  /** 引用方的表名（同时用于 `getRepository()` 与给人看的证据） */
  table: string;
  /** 引用列（**实体属性名**，供 TypeORM 的 where 用；库里是 snake_case 的列） */
  column: string;
  /** 这些行自己的 resultType —— 它们若也在本次撤销集合里，就不算「留下未了结的引用」 */
  ownResultType: string;
}

/**
 * `resultType` → 指向它的表。**空数组是有意义的**（查过、没有），缺席才是「没有模型」。
 */
export const DERIVED_REFERENCES: Record<string, DerivedReference[]> = {
  // 六个旗舰别名里，五个的入边核过为零（`entity` 级的 `*_id` 关系列只有 `project_id` 与 `customer_id`，
  // 而 customer 不可撤 —— `delete_customer` 是 R5 阻断）。列出来是为了让「查过、没有」与「没查」可分。
  event: [],
  todo: [],
  crm_task: [],
  pm_task: [],
  app_request: [],
  contract: [],
  // 唯一真有入边的可撤销类型：四张 PM 子表带 `project_id` 的 `@Column` + `@JoinColumn`。
  // 复合写工具 `create_project_with_tasks` 的补偿组只含**它自己创建**的 project + task，
  // 之后别人加的里程碑/风险/成员不在组里 ⇒ 撤销项目后它们仍指着一条已软删的行。
  pm_project: [
    { table: 'pm_tasks', column: 'projectId', ownResultType: 'pm_task' },
    { table: 'pm_milestones', column: 'projectId', ownResultType: 'pm_milestone' },
    { table: 'pm_risks', column: 'projectId', ownResultType: 'pm_risk' },
    { table: 'pm_members', column: 'projectId', ownResultType: 'pm_member' },
  ],
};
