// SPDX-License-Identifier: Apache-2.0

/**
 * One table of the API's resource routes, and three views derived from it.
 *
 * Three lists used to describe the same routes, each maintained by hand:
 *  - the operation-audit interceptor mapped a path to an **entity class**, so it could load the row
 *    before a PATCH/PUT and snapshot it;
 *  - the business-event normaliser mapped the same path to a **business-event prefix**;
 *  - the business-history service mapped an AI side effect's `resultType` back to a **path**.
 *
 * They had drifted, and the consequences were quiet. Routes missing from the first list (the
 * generated modules, project milestones, approval policies) produced no before-snapshot at all; two
 * org routes named classes that do not exist (`OrganizationMember` / `OrganizationInvite` — the real
 * classes are `OrgMember` / `OrgInvite`), so `getRepository` threw, the interceptor caught the
 * throw, and those snapshots were silently absent too. A missing snapshot and a snapshot that could
 * not be taken are the same nothing on the audit row.
 *
 * So the route list lives here once, and each consumer derives its own name from it. A route that
 * has no entity class (the org request is a workflow, not a table) says so with `entity: null`
 * rather than being left out, which is the difference between "no snapshot because there is
 * nothing to snapshot" and "no snapshot because nobody updated this list".
 *
 * 一张资源路由表，以及由它派生的三个视图。
 *
 * 过去有**三份**清单描述同一批路由，各自靠人维护：
 *  - 操作审计拦截器把路径映射到**实体类**（PATCH/PUT 前取行做 before 快照）；
 *  - 业务事件归一化把同一路径映射到**事件前缀**；
 *  - 业务历史服务把 AI 副作用的 `resultType` 反向映射到**路径**。
 *
 * 它们已经漂移，后果是安静的：第一份里**缺**的路由（生成模块、项目里程碑、审批政策）**根本没有
 * before 快照**；两条 org 路由写的是**不存在的类名**（`OrganizationMember` / `OrganizationInvite`，
 * 真类是 `OrgMember` / `OrgInvite`）—— `getRepository` 抛错、拦截器 `catch` 吞掉，那些行的快照
 * 同样静默缺席。**没拍快照**与**拍不了快照**，在审计行上是同一个「没有」。
 *
 * 所以路由清单只此一份，各消费方从中派生自己的名字。**没有实体类**的路由（组织申请是工作流、
 * 不是表）用 `entity: null` 说明，而不是省略 —— 这正是「没有东西可拍快照」与「没人更新这份清单」的区别。
 */

export interface ResourceRoute {
  match: RegExp;
  /** 操作审计取行做 diff 用的实体类名；`null` = 该资源没有实体表。 */
  entity: string | null;
  /** 业务事件前缀（`deriveBusinessEvent` 会接上 Created / Updated / Deleted）。 */
  event: string;
  /** 该资源作为 AI 副作用 `resultType` 时的名字（仅 AI 工具可写的资源有）。 */
  resultType?: string;
  /** 该 `resultType` 在操作审计里对应的路径前缀（`pathsForResultType` 按 `LIKE %前缀%` 过滤用）。 */
  pathPrefix?: string;
}

/** 按优先级匹配：先精确（子资源）后兜底（父资源）。Specific routes first, generic ones after. */
export const RESOURCE_ROUTES: readonly ResourceRoute[] = [
  // CRM 子资源 / customer sub-resources
  { match: /\/crm\/customers\/\d+\/opportunities/, entity: 'CrmOpportunity', event: 'CustomerOpportunity' },
  { match: /\/crm\/customers\/\d+\/contacts/, entity: 'CrmContact', event: 'CustomerContact' },
  { match: /\/crm\/customers\/\d+\/risks/, entity: 'CrmRisk', event: 'CustomerRisk' },
  { match: /\/crm\/customers\/\d+\/orders/, entity: 'CrmOrder', event: 'CustomerOrder' },
  { match: /\/crm\/customers\/\d+\/activities/, entity: 'CrmActivity', event: 'CustomerActivity' },
  // 组织子资源 / organization sub-resources（类名取自实体本身：`OrgInvite` / `OrgMember`）
  { match: /\/org\/organizations\/\d+\/invites/, entity: 'OrgInvite', event: 'OrganizationInvite' },
  { match: /\/org\/organizations\/\d+\/members/, entity: 'OrgMember', event: 'OrganizationMember' },
  { match: /\/org\/organizations\/\d+\/departments/, entity: 'Department', event: 'Department' },
  // CRM 父资源与扁平子路由 / customer and the flat crm routes
  { match: /\/crm\/customers/, entity: 'CrmCustomer', event: 'Customer' },
  {
    match: /\/crm\/tasks/,
    entity: 'CrmTask',
    event: 'FollowupTask',
    resultType: 'crm_task',
    pathPrefix: '/crm/tasks/',
  },
  { match: /\/crm\/orders/, entity: 'CrmOrder', event: 'CustomerOrder' },
  { match: /\/crm\/activities/, entity: 'CrmActivity', event: 'CustomerActivity' },
  { match: /\/crm\/opportunities/, entity: 'CrmOpportunity', event: 'CustomerOpportunity' },
  { match: /\/crm\/contacts/, entity: 'CrmContact', event: 'CustomerContact' },
  { match: /\/crm\/risks/, entity: 'CrmRisk', event: 'CustomerRisk' },
  // 项目 / projects
  {
    match: /\/pm\/projects/,
    entity: 'PmProject',
    event: 'Project',
    resultType: 'pm_project',
    pathPrefix: '/pm/projects/',
  },
  { match: /\/pm\/milestones/, entity: 'PmMilestone', event: 'ProjectMilestone' },
  {
    match: /\/pm\/tasks/,
    entity: 'PmTask',
    event: 'ProjectTask',
    resultType: 'pm_task',
    pathPrefix: '/pm/tasks/',
  },
  // 审批 / approval
  {
    match: /\/approval\/requests/,
    entity: 'ApprovalRequest',
    event: 'ApprovalRequest',
    resultType: 'app_request',
    pathPrefix: '/approval/requests/',
  },
  { match: /\/approval\/policies/, entity: 'ApprovalPolicy', event: 'ApprovalPolicy' },
  // 生成模块 / generated modules
  {
    match: /\/contracts/,
    entity: 'Contract',
    event: 'Contract',
    resultType: 'contract',
    pathPrefix: '/contracts/',
  },
  { match: /\/suppliers/, entity: 'Supplier', event: 'Supplier' },
  { match: /\/tags/, entity: 'Tag', event: 'Tag' },
  { match: /\/notes/, entity: 'Note', event: 'Note' },
  { match: /\/books/, entity: 'Book', event: 'Book' },
  { match: /\/posts/, entity: 'Post', event: 'Post' },
  // 基础实体 / base entities
  {
    match: /\/events/,
    entity: 'Event',
    event: 'Event',
    resultType: 'event',
    pathPrefix: '/events/',
  },
  {
    match: /\/todos/,
    entity: 'Todo',
    event: 'Todo',
    resultType: 'todo',
    pathPrefix: '/todos/',
  },
  { match: /\/users/, entity: 'User', event: 'User' },
  // 组织（扁平路由）/ organization, flat routes
  { match: /\/org\/organizations/, entity: 'Organization', event: 'Organization' },
  { match: /\/org\/departments/, entity: 'Department', event: 'Department' },
  { match: /\/org\/members/, entity: 'OrgMember', event: 'Member' },
  { match: /\/org\/invites/, entity: 'OrgInvite', event: 'OrganizationInvite' },
  // 组织申请是 FLOW 工作流，没有实体表 —— 显式说明，而不是漏掉
  { match: /\/org\/requests/, entity: null, event: 'OrganizationRequest' },
];

/** 该路径对应的实体类名（用于取行做 before 快照）；无对应实体时返回 null。 */
export function resourceEntityFor(path: string): string | null {
  const p = path.split('?')[0];
  for (const route of RESOURCE_ROUTES) {
    if (route.match.test(p)) return route.entity;
  }
  return null;
}

/** 该路径对应的业务事件前缀；无对应资源时返回 null。 */
export function resourceEventFor(path: string): string | null {
  const p = path.split('?')[0];
  for (const route of RESOURCE_ROUTES) {
    if (route.match.test(p)) return route.event;
  }
  return null;
}

/** 该 AI 副作用 `resultType` 在操作审计里的路径前缀（防跨资源 id 碰撞）；未知类型返回空数组。 */
export function pathsForResultType(resultType: string): string[] {
  const route = RESOURCE_ROUTES.find((r) => r.resultType === resultType);
  return route?.pathPrefix ? [route.pathPrefix] : [];
}
