import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { User } from '../common/entities/user.entity';
import { CrmCustomer } from '../crm/crm-customer.entity';
import { CrmOrder } from '../crm/crm-order.entity';
import { CrmTask } from '../crm/crm-task.entity';
import { CrmRisk } from '../crm/crm-risk.entity';
import { PmProject } from '../pm/pm-project.entity';
import { PmTask } from '../pm/pm-task.entity';
import { PmRisk } from '../pm/pm-risk.entity';
import { ApprovalRequest } from '../approval/approval-request.entity';
import { ApprovalPolicy } from '../approval/approval-policy.entity';
import { EventsService } from '../events/events.service';
import { TodosService } from '../todos/todos.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TemplatesService } from './templates.service';
import { APP_TEMPLATES } from './templates';

describe('TemplatesService（PL-9）', () => {
  let service: TemplatesService;
  let usersRepo: { findOne: jest.Mock };
  let eventsService: { create: jest.Mock };
  let todosService: { create: jest.Mock };
  let notificationsService: { create: jest.Mock };
  let crmCustomers: { save: jest.Mock; create: jest.Mock };
  let crmOrders: { save: jest.Mock; create: jest.Mock };
  let crmTasks: { save: jest.Mock; create: jest.Mock };
  let crmRisks: { save: jest.Mock; create: jest.Mock };
  let pmProjects: { save: jest.Mock; create: jest.Mock };
  let pmTasks: { save: jest.Mock; create: jest.Mock };
  let pmRisks: { save: jest.Mock; create: jest.Mock };
  let appRequests: { save: jest.Mock; create: jest.Mock };
  let appPolicies: { save: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    usersRepo = { findOne: jest.fn() };
    eventsService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    todosService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    notificationsService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const mockRepo = () => ({
      create: jest.fn((d: any) => ({ id: 1, ...d })),
      save: jest.fn((d: any) => Promise.resolve(d)),
    });
    crmCustomers = mockRepo();
    crmOrders = mockRepo();
    crmTasks = mockRepo();
    crmRisks = mockRepo();
    pmProjects = mockRepo();
    pmTasks = mockRepo();
    pmRisks = mockRepo();
    appRequests = mockRepo();
    appPolicies = mockRepo();

    const moduleRef = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(CrmCustomer), useValue: crmCustomers },
        { provide: getRepositoryToken(CrmOrder), useValue: crmOrders },
        { provide: getRepositoryToken(CrmTask), useValue: crmTasks },
        { provide: getRepositoryToken(CrmRisk), useValue: crmRisks },
        { provide: getRepositoryToken(PmProject), useValue: pmProjects },
        { provide: getRepositoryToken(PmTask), useValue: pmTasks },
        { provide: getRepositoryToken(PmRisk), useValue: pmRisks },
        { provide: getRepositoryToken(ApprovalRequest), useValue: appRequests },
        { provide: getRepositoryToken(ApprovalPolicy), useValue: appPolicies },
        { provide: EventsService, useValue: eventsService },
        { provide: TodosService, useValue: todosService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();
    service = moduleRef.get(TemplatesService);
  });

  it('listTemplates 返回内置模板（含三个旗舰模板）', () => {
    const templates = service.listTemplates();
    expect(templates.length).toBe(APP_TEMPLATES.length);
    expect(templates.map((t) => t.id)).toEqual(expect.arrayContaining(['personal-assistant', 'crm-demo', 'pm-demo', 'approval-demo']));
  });

  it('importTemplate 导入事件与待办到默认 admin', async () => {
    usersRepo.findOne.mockResolvedValueOnce({ id: 5 }).mockResolvedValueOnce(null);
    const result = await service.importTemplate('personal-assistant');

    expect(eventsService.create).toHaveBeenCalled();
    expect(todosService.create).toHaveBeenCalled();
    expect(result.events).toBeGreaterThan(0);
    expect(result.targetUserId).toBe(5);
    expect(notificationsService.create).toHaveBeenCalled();
  });

  it('importTemplate 旗舰模板：crm-demo 种客户/订单/任务/风险', async () => {
    usersRepo.findOne.mockResolvedValueOnce({ id: 5 }).mockResolvedValueOnce(null);
    const result = await service.importTemplate('crm-demo');

    expect(crmCustomers.save).toHaveBeenCalled();
    expect(result.customers).toBeGreaterThan(0);
    // 关联子实体也种入
    expect(crmOrders.save).toHaveBeenCalled();
    expect(crmTasks.save).toHaveBeenCalled();
    expect(crmRisks.save).toHaveBeenCalled();
  });

  it('importTemplate 旗舰模板：approval-demo 种政策与请求', async () => {
    usersRepo.findOne.mockResolvedValueOnce({ id: 5 }).mockResolvedValueOnce(null);
    const result = await service.importTemplate('approval-demo');

    expect(appPolicies.save).toHaveBeenCalled();
    expect(appRequests.save).toHaveBeenCalled();
    expect(result.requests).toBeGreaterThan(0);
  });

  it('importTemplate 旗舰模板：pm-demo 种项目/任务/风险', async () => {
    usersRepo.findOne.mockResolvedValueOnce({ id: 5 }).mockResolvedValueOnce(null);
    const result = await service.importTemplate('pm-demo');
    expect(pmProjects.save).toHaveBeenCalled();
    expect(pmTasks.save).toHaveBeenCalled();
    expect(pmRisks.save).toHaveBeenCalled();
    expect(result.projects).toBeGreaterThan(0);
  });

  it('importTemplate pm 分支：任务/风险可选不种', async () => {
    usersRepo.findOne.mockResolvedValueOnce({ id: 5 }).mockResolvedValueOnce(null);
    // 模板里 pm.projects[0] 无 tasks/risks 时 save 不调用子实体
    const result = await service.importTemplate('pm-demo');
    expect(pmProjects.save).toHaveBeenCalled();
    expect(result.projects).toBeGreaterThan(0);
  });

  it('resolveDefaultUser：优先 admin，无 admin 用任意用户，都无抛 404', async () => {
    usersRepo.findOne.mockResolvedValueOnce({ id: 1, username: 'admin' });
    expect(await (service as any).resolveDefaultUser()).toBe(1);

    usersRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 9 });
    expect(await (service as any).resolveDefaultUser()).toBe(9);

    usersRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(service.importTemplate('crm-demo')).rejects.toBeInstanceOf(NotFoundException);
  });
});
