// SPDX-License-Identifier: Apache-2.0

import { RESOURCE_ROUTES, pathsForResultType, resourceEntityFor, resourceEventFor } from './resource-routes';
import { entityFor } from '../ai/tool-effects/side-effect-revoker';

/**
 * The registry replaced three hand-maintained lists (operation-audit interceptor RESOURCE_ENTITY,
 * business-event RESOURCES, business-history REST_RESOURCE_PATHS). Two of them had drifted: the
 * entity list was narrower than the event list, and two org routes named classes that do not exist.
 * These cases pin both halves — the routes that used to fall through (so they cannot fall through
 * again), and the names the event list already produced (so the union did not quietly narrow it).
 *
 * 注册表取代了三份手抄清单。其中两份已漂移：实体清单比事件清单窄，且两条 org 路由写了不存在的
 * 类名。下列用例同时钉住两边 —— **原先漏掉的路由**（不许再漏）与**事件清单原有的名字**
 * （并集不许悄悄收窄）。
 */
describe('resource-routes 单一资源注册表', () => {
  describe('实体映射：原先无映射、静默没有 before 快照的路由', () => {
    it.each([
      ['/api/v1/contracts/5', 'Contract'],
      ['/api/v1/suppliers/5', 'Supplier'],
      ['/api/v1/tags/5', 'Tag'],
      ['/api/v1/notes/5', 'Note'],
      ['/api/v1/books/5', 'Book'],
      ['/api/v1/posts/5', 'Post'],
      ['/api/v1/pm/milestones/5', 'PmMilestone'],
      ['/api/v1/approval/policies/5', 'ApprovalPolicy'],
      ['/api/v1/crm/orders/5', 'CrmOrder'],
      ['/api/v1/crm/activities/5', 'CrmActivity'],
      ['/api/v1/crm/opportunities/5', 'CrmOpportunity'],
      ['/api/v1/crm/contacts/5', 'CrmContact'],
      ['/api/v1/crm/risks/5', 'CrmRisk'],
    ])('%s → %s（旧实现为 null）', (path, entity) => {
      expect(resourceEntityFor(path)).toBe(entity);
    });
  });

  describe('实体映射：org 路由曾写不存在的类名（getRepository 抛错 → 静默无快照）', () => {
    it('组织子资源的实体名取自真实类（OrgInvite / OrgMember，非 Organization*）', () => {
      expect(resourceEntityFor('/api/v1/org/organizations/2/invites')).toBe('OrgInvite');
      expect(resourceEntityFor('/api/v1/org/organizations/2/members')).toBe('OrgMember');
      expect(resourceEntityFor('/api/v1/org/invites')).toBe('OrgInvite');
      expect(resourceEntityFor('/api/v1/org/members/7')).toBe('OrgMember');
    });

    it('子资源优先于父资源匹配（/org/organizations/:id/members 不被 /org/organizations 抢先）', () => {
      expect(resourceEntityFor('/api/v1/org/organizations/2/members')).toBe('OrgMember');
      expect(resourceEntityFor('/api/v1/org/organizations/2')).toBe('Organization');
    });
  });

  describe('实体映射：没有实体表的资源显式写 null，而不是漏掉', () => {
    it('组织申请是 FLOW 工作流 → entity null（有事件、无快照）', () => {
      expect(resourceEntityFor('/api/v1/org/requests')).toBeNull();
      expect(resourceEventFor('/api/v1/org/requests')).toBe('OrganizationRequest');
    });

    it('表外路径 → null', () => {
      expect(resourceEntityFor('/api/v1/notifications/5')).toBeNull();
    });
  });

  describe('事件映射：与旧 RESOURCES 逐条同值（并集未收窄）', () => {
    it.each([
      ['/api/v1/crm/customers', 'Customer'],
      ['/api/v1/crm/customers/3/opportunities', 'CustomerOpportunity'],
      ['/api/v1/crm/customers/3/contacts', 'CustomerContact'],
      ['/api/v1/crm/customers/3/risks', 'CustomerRisk'],
      ['/api/v1/crm/customers/3/orders', 'CustomerOrder'],
      ['/api/v1/crm/customers/3/activities', 'CustomerActivity'],
      ['/api/v1/crm/tasks/9', 'FollowupTask'],
      ['/api/v1/crm/orders/9', 'CustomerOrder'],
      ['/api/v1/crm/activities/9', 'CustomerActivity'],
      ['/api/v1/crm/opportunities/9', 'CustomerOpportunity'],
      ['/api/v1/crm/contacts/9', 'CustomerContact'],
      ['/api/v1/crm/risks/9', 'CustomerRisk'],
      ['/api/v1/pm/projects/9', 'Project'],
      ['/api/v1/pm/milestones/9', 'ProjectMilestone'],
      ['/api/v1/pm/tasks/9', 'ProjectTask'],
      ['/api/v1/approval/requests/9', 'ApprovalRequest'],
      ['/api/v1/approval/policies/9', 'ApprovalPolicy'],
      ['/api/v1/contracts/9', 'Contract'],
      ['/api/v1/suppliers/9', 'Supplier'],
      ['/api/v1/tags/9', 'Tag'],
      ['/api/v1/notes/9', 'Note'],
      ['/api/v1/books/9', 'Book'],
      ['/api/v1/posts/9', 'Post'],
      ['/api/v1/events/9', 'Event'],
      ['/api/v1/todos/9', 'Todo'],
      ['/api/v1/users/9', 'User'],
      ['/api/v1/org/organizations/2/invites', 'OrganizationInvite'],
      ['/api/v1/org/organizations/2/members', 'OrganizationMember'],
      ['/api/v1/org/organizations/2/departments', 'Department'],
      ['/api/v1/org/organizations/2', 'Organization'],
      ['/api/v1/org/departments/9', 'Department'],
      ['/api/v1/org/members/9', 'Member'],
      ['/api/v1/org/invites/9', 'OrganizationInvite'],
      ['/api/v1/org/requests/9', 'OrganizationRequest'],
    ])('%s → %s', (path, event) => {
      expect(resourceEventFor(path)).toBe(event);
    });

    it('查询串被剥掉后再匹配', () => {
      expect(resourceEventFor('/api/v1/contracts?page=1')).toBe('Contract');
      expect(resourceEntityFor('/api/v1/contracts?page=1')).toBe('Contract');
    });
  });

  describe('AI 副作用 resultType → 路径前缀（与 entityFor 同源）', () => {
    it.each([
      ['crm_task', ['/crm/tasks/']],
      ['pm_task', ['/pm/tasks/']],
      ['pm_project', ['/pm/projects/']],
      ['app_request', ['/approval/requests/']],
      ['contract', ['/contracts/']],
      ['todo', ['/todos/']],
      ['event', ['/events/']],
    ])('%s → %s', (resultType, paths) => {
      expect(pathsForResultType(resultType)).toEqual(paths);
    });

    it('未知 resultType → 空数组（不放大查询范围）', () => {
      expect(pathsForResultType('proxy_call')).toEqual([]);
      expect(pathsForResultType('nonexistent')).toEqual([]);
    });

    it('resultType 在表内唯一，且与 pathPrefix 同生同灭', () => {
      // `pathsForResultType` 用 find()，重复的 resultType 会让后者被静默丢弃；而只有 resultType
      // 没有 pathPrefix 的行会静默返回空数组 —— 两种都是「表看着写全了、查询却少一段」。
      const declared = RESOURCE_ROUTES.filter((r) => r.resultType);
      expect(new Set(declared.map((r) => r.resultType)).size).toBe(declared.length);
      for (const route of declared) expect(route.pathPrefix).toBeTruthy();
      for (const route of RESOURCE_ROUTES.filter((r) => r.pathPrefix)) {
        expect(route.resultType).toBeTruthy();
      }
    });

    it('别名型 resultType 的实体名与 entityFor 一致（两处不许各说各话）', () => {
      for (const rt of ['crm_task', 'pm_task', 'app_request', 'contract', 'todo', 'event']) {
        const path = pathsForResultType(rt)[0];
        expect(entityFor(rt)).not.toBeNull();
        expect(resourceEntityFor(path)).toBe(entityFor(rt));
      }
    });

    it('pm_project 无别名（撤销侧走实体元数据），注册表仍须写明实体名', () => {
      // `entityFor('pm_project')` 是 null —— 撤销侧靠实体元数据解析（side-effect-revoker）。
      // 但注册表这一列还有第二个消费者：证据根按 resultType 反查 operation_audit 的 path，
      // 那份旧手抄**有** pm_project 而 business-history 那份**没有**（漂移）。实体名写在这里，
      // 两边才不会各说各话。
      expect(entityFor('pm_project')).toBeNull();
      expect(resourceEntityFor(pathsForResultType('pm_project')[0])).toBe('PmProject');
    });
  });
});
