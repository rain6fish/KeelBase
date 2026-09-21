// SPDX-License-Identifier: Apache-2.0

import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

describe('CrmController（AI CRM 旗舰）', () => {
  let controller: CrmController;
  let crmService: Record<string, jest.Mock>;
  let crmAnalytics: { analyzeRisk: jest.Mock; getDashboard: jest.Mock };

  const mockUser = { sub: 1, username: 'alex' };
  const ability = {} as any;

  const methods = [
    'createCustomer', 'listCustomers', 'getCustomerDetail', 'updateCustomer',
    'removeCustomer', 'listOrders', 'createOrder',
    'listActivities', 'createActivity', 'listTasks', 'createTask',
    'completeTask', 'listRisks', 'createRisk',
    // Customer 360（P0 §10）：销售机会 / 联系人 / 洞察看板
    'listOpportunities', 'createOpportunity', 'updateOpportunity',
    'removeOpportunity', 'listContacts', 'createContact', 'updateContact', 'removeContact',
  ];

  beforeEach(() => {
    crmService = Object.fromEntries(methods.map((m) => [m, jest.fn()]));
    // 分析域（阶段 3 第十三刀）：风险打分 / 看板聚合已独立
    crmAnalytics = { analyzeRisk: jest.fn(), getDashboard: jest.fn() };
    controller = new CrmController(crmService as unknown as CrmService, crmAnalytics as any);
  });

  it('客户 CRUD 委托 service', async () => {
    const dto = { name: 'Acme', status: 'active' };
    crmService.createCustomer.mockReturnValue({ id: 1 });
    crmService.listCustomers.mockReturnValue({ items: [], total: 0 });
    crmService.getCustomerDetail.mockReturnValue({ id: 1 });
    crmService.updateCustomer.mockReturnValue({ id: 1 });
    crmService.removeCustomer.mockResolvedValue(undefined);

    expect(controller.createCustomer(dto as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.listCustomers(mockUser as any, 1, 20, 'active', 'high', 'acme')).toEqual({ items: [], total: 0 });
    expect(controller.getCustomerDetail(1, mockUser as any, ability)).toEqual({ id: 1 });
    expect(controller.updateCustomer(1, dto as any, mockUser as any, ability)).toEqual({ id: 1 });
    await expect(controller.removeCustomer(1, mockUser as any, ability)).resolves.toBeNull();

    expect(crmService.createCustomer).toHaveBeenCalledWith(dto, 1);
    expect(crmService.listCustomers).toHaveBeenCalledWith(1, { page: 1, limit: 20, status: 'active', riskLevel: 'high', keyword: 'acme' });
    expect(crmService.getCustomerDetail).toHaveBeenCalledWith(1, ability);
    expect(crmService.updateCustomer).toHaveBeenCalledWith(1, dto, ability);
    expect(crmService.removeCustomer).toHaveBeenCalledWith(1, ability);
  });

  it('风险分析委托 service', () => {
    crmAnalytics.analyzeRisk.mockReturnValue({ score: 8, level: 'high' });
    expect(controller.analyze(1, mockUser as any)).toEqual({ score: 8, level: 'high' });
    expect(crmAnalytics.analyzeRisk).toHaveBeenCalledWith(1, 1);
  });

  it('订单/跟进子资源委托 service', () => {
    crmService.listOrders.mockReturnValue([]);
    crmService.createOrder.mockReturnValue({ id: 1 });
    crmService.listActivities.mockReturnValue([]);
    crmService.createActivity.mockReturnValue({ id: 1 });

    expect(controller.listOrders(1, mockUser as any)).toEqual([]);
    expect(controller.createOrder(1, { amount: 100 } as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.listActivities(1, mockUser as any)).toEqual([]);
    expect(controller.createActivity(1, { note: 'x' } as any, mockUser as any)).toEqual({ id: 1 });

    expect(crmService.createOrder).toHaveBeenCalledWith(1, { amount: 100 }, 1);
    expect(crmService.createActivity).toHaveBeenCalledWith(1, { note: 'x' }, 1);
  });

  it('任务/风险委托 service', () => {
    crmService.listTasks.mockReturnValueOnce([]); // 客户任务
    crmService.listTasks.mockReturnValueOnce([]); // 我的任务
    crmService.createTask.mockReturnValue({ id: 1 });
    crmService.completeTask.mockReturnValue({ id: 1, completed: true });
    crmService.listRisks.mockReturnValue([]);
    crmService.createRisk.mockReturnValue({ id: 1 });

    expect(controller.listTasks(1, mockUser as any)).toEqual([]);
    expect(crmService.listTasks).toHaveBeenCalledWith(1, 1);
    expect(controller.listMyTasks(mockUser as any)).toEqual([]);
    expect(crmService.listTasks).toHaveBeenLastCalledWith(1);
    expect(controller.createTask({ title: '跟进' } as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.completeTask(2, mockUser as any)).toEqual({ id: 1, completed: true });
    expect(controller.listRisks(1, mockUser as any)).toEqual([]);
    expect(controller.createRisk(1, { level: 'high' } as any, mockUser as any)).toEqual({ id: 1 });

    expect(crmService.createTask).toHaveBeenCalledWith({ title: '跟进' }, 1);
    expect(crmService.completeTask).toHaveBeenCalledWith(2, 1);
    expect(crmService.createRisk).toHaveBeenCalledWith(1, { level: 'high' }, 1);
  });

  it('Customer 360：洞察看板委托 service', () => {
    crmAnalytics.getDashboard.mockReturnValue({ customers: 3, pipeline: [] });
    expect(controller.getDashboard(mockUser as any)).toEqual({ customers: 3, pipeline: [] });
    expect(crmAnalytics.getDashboard).toHaveBeenCalledWith(1);
  });

  it('Customer 360：销售机会 CRUD 委托 service', async () => {
    crmService.listOpportunities.mockReturnValue([]);
    crmService.createOpportunity.mockReturnValue({ id: 1 });
    crmService.updateOpportunity.mockReturnValue({ id: 1, stage: 'won' });
    crmService.removeOpportunity.mockResolvedValue(undefined);

    expect(controller.listOpportunities(1, mockUser as any)).toEqual([]);
    expect(controller.createOpportunity(1, { name: '新单' } as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.updateOpportunity(1, 2, { stage: 'won' } as any, mockUser as any)).toEqual({ id: 1, stage: 'won' });
    await expect(controller.removeOpportunity(1, 2, mockUser as any)).resolves.toBeUndefined();

    expect(crmService.listOpportunities).toHaveBeenCalledWith(1, 1);
    expect(crmService.createOpportunity).toHaveBeenCalledWith(1, { name: '新单' }, 1);
    expect(crmService.updateOpportunity).toHaveBeenCalledWith(1, 2, { stage: 'won' }, 1);
    expect(crmService.removeOpportunity).toHaveBeenCalledWith(1, 2, 1);
  });

  it('Customer 360：联系人 CRUD 委托 service', async () => {
    crmService.listContacts.mockReturnValue([]);
    crmService.createContact.mockReturnValue({ id: 1 });
    crmService.updateContact.mockReturnValue({ id: 1 });
    crmService.removeContact.mockResolvedValue(undefined);

    expect(controller.listContacts(1, mockUser as any)).toEqual([]);
    expect(controller.createContact(1, { name: '张三' } as any, mockUser as any)).toEqual({ id: 1 });
    expect(controller.updateContact(1, 2, { phone: 'x' } as any, mockUser as any)).toEqual({ id: 1 });
    await expect(controller.removeContact(1, 2, mockUser as any)).resolves.toBeUndefined();

    expect(crmService.listContacts).toHaveBeenCalledWith(1, 1);
    expect(crmService.createContact).toHaveBeenCalledWith(1, { name: '张三' }, 1);
    expect(crmService.updateContact).toHaveBeenCalledWith(1, 2, { phone: 'x' }, 1);
    expect(crmService.removeContact).toHaveBeenCalledWith(1, 2, 1);
  });
});
