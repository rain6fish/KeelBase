// SPDX-License-Identifier: Apache-2.0

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CrmService } from './crm.service';
import { CrmCustomer } from './crm-customer.entity';
import { CrmOrder } from './crm-order.entity';
import { CrmActivity } from './crm-activity.entity';
import { CrmTask } from './crm-task.entity';
import { CrmRisk } from './crm-risk.entity';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';

type AppAbility = MongoAbility<['manage' | 'read' | 'update' | 'delete', string | Record<string, any>]>;

function ownerAbility(userId: number): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  can('manage', 'CrmCustomer', { userId });
  can('manage', 'CrmOrder', { userId });
  can('manage', 'CrmActivity', { userId });
  can('manage', 'CrmTask', { userId });
  can('manage', 'CrmRisk', { userId });
  return build();
}

function makeRepo<T>(rows: T[] = []) {
  return {
    create: jest.fn((d: Partial<T>) => d as T),
    save: jest.fn(async (e: any) => (typeof e === 'object' && !Array.isArray(e) && e !== null ? e : e)),
    findOne: jest.fn(async ({ where }: any = {}) =>
      rows.find((r: any) =>
        Object.entries(where ?? {}).every(([k, v]) => (r as any)[k] === v),
      ) ?? null,
    ),
    find: jest.fn(async () => rows),
    findAndCount: jest.fn(async () => [rows, rows.length]),
    count: jest.fn(async () => rows.length),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {};
      qb.where = () => qb;
      qb.andWhere = () => qb;
      qb.orderBy = () => qb;
      qb.skip = () => qb;
      qb.take = () => qb;
      qb.getManyAndCount = async () => [rows, rows.length];
      return qb;
    }),
  } as unknown as jest.Mocked<Repository<any>>;
}

describe('CrmService', () => {
  let service: CrmService;
  let customers: any;
  let orders: any;
  let activities: any;
  let tasks: any;
  let risks: any;
  let opportunities: any;
  let contacts: any;

  const customer = (id: number, userId = 1, overrides: Partial<CrmCustomer> = {}) =>
    ({ id, name: `客户${id}`, status: 'active', riskLevel: 'low', userId, ...overrides }) as CrmCustomer;

  beforeEach(() => {
    customers = makeRepo([customer(1), customer(2, 2)]);
    orders = makeRepo([]);
    activities = makeRepo([]);
    tasks = makeRepo([]);
    risks = makeRepo([]);
    opportunities = makeRepo([]);
    contacts = makeRepo([]);
    service = new CrmService(
      customers as any, orders as any, activities as any, tasks as any, risks as any, opportunities as any, contacts as any,
    );
  });

  describe('createCustomer', () => {
    it('创建客户并归属 userId', async () => {
      const result = await service.createCustomer({ name: '新客户' } as any, 7);
      expect(customers.create).toHaveBeenCalledWith({ name: '新客户', userId: 7 });
      expect(customers.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('listCustomers', () => {
    it('按 userId 过滤返回本人客户', async () => {
      const { items } = await service.listCustomers(1);
      expect(customers.createQueryBuilder).toHaveBeenCalled();
      expect(items.length).toBe(2);
    });
  });

  describe('getCustomer', () => {
    it('本人可读', async () => {
      await expect(service.getCustomer(1, ownerAbility(1))).resolves.toMatchObject({ id: 1 });
    });
    it('非本人 → Forbidden', async () => {
      await expect(service.getCustomer(1, ownerAbility(9))).rejects.toThrow(ForbiddenException);
    });
    it('不存在 → NotFound', async () => {
      await expect(service.getCustomer(999, ownerAbility(1))).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeCustomer', () => {
    it('软删除本人客户', async () => {
      await service.removeCustomer(1, ownerAbility(1));
      expect(customers.softDelete).toHaveBeenCalledWith(1);
    });
  });

  describe('createOrder', () => {
    it('非本人客户 → NotFound（防越权）', async () => {
      await expect(service.createOrder(2, { amount: 100 } as any, 1)).rejects.toThrow(NotFoundException);
    });
    it('本人客户可创建订单', async () => {
      const result = await service.createOrder(1, { amount: 500, dueDate: '2026-09-01T00:00:00Z' } as any, 1);
      expect(orders.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('createTask', () => {
    it('无客户关联可创建', async () => {
      const result = await service.createTask({ title: '普通任务' } as any, 1);
      expect(tasks.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
    it('关联非本人客户 → NotFound', async () => {
      await expect(service.createTask({ title: 'x', customerId: 2 } as any, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('completeTask', () => {
    it('完成任务置 completed', async () => {
      tasks.findOne.mockResolvedValue({ id: 1, userId: 1, status: 'pending', title: 't' });
      const result = await service.completeTask(1, 1);
      expect(result.status).toBe('completed');
    });
    it('非本人任务 → NotFound', async () => {
      tasks.findOne.mockImplementation(async () => null);
      await expect(service.completeTask(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('analyzeRisk', () => {
    it('逾期订单 + 未解决风险 → high', async () => {
      customers.findOne.mockResolvedValue(customer(1));
      orders.find.mockResolvedValue([{ amount: 450000, status: 'overdue', dueDate: null }]);
      tasks.find.mockResolvedValue([]);
      risks.find.mockResolvedValue([{ level: 'high', reason: 'r', resolvedAt: null }]);
      const result = await service.analyzeRisk(1, 1);
      expect(result.level).toBe('high');
      expect(result.reasons.some((r) => r.includes('逾期'))).toBe(true);
    });

    it('大额逾期（>100万）+ 风险 → critical', async () => {
      customers.findOne.mockResolvedValue(customer(1));
      orders.find.mockResolvedValue([{ amount: 2800000, status: 'overdue', dueDate: null }]);
      tasks.find.mockResolvedValue([]);
      risks.find.mockResolvedValue([{ level: 'critical', reason: '资金链', resolvedAt: null }]);
      const result = await service.analyzeRisk(1, 1);
      expect(result.level).toBe('critical');
    });

    it('无风险数据 → low', async () => {
      customers.findOne.mockResolvedValue(customer(1, 1, { status: 'active' }));
      orders.find.mockResolvedValue([{ amount: 10000, status: 'paid', dueDate: null }]);
      tasks.find.mockResolvedValue([]);
      risks.find.mockResolvedValue([]);
      const result = await service.analyzeRisk(1, 1);
      expect(result.level).toBe('low');
    });
  });

  describe('detectIdleCustomers（AI Follow-up Agent）', () => {
    it('activity 旧/从未联系命中，30 天内未命中，按 userId 过滤', async () => {
      const old = new Date(Date.now() - 40 * 86400000);
      const recent = new Date(Date.now() - 10 * 86400000);
      // mock 模拟 repo 已按 userId=1 过滤（真实 find({where:{userId}}) 不含他人客户 id9）
      customers.find.mockResolvedValue([
        { id: 1, name: '辰光', company: '辰光集团', status: 'active', riskLevel: 'medium', userId: 1 },
        { id: 2, name: '从未联系', company: null, status: 'lead', riskLevel: 'low', userId: 1 },
        { id: 3, name: '活跃客户', company: 'X', status: 'active', riskLevel: 'low', userId: 1 },
      ]);
      activities.find.mockResolvedValue([
        { customerId: 1, happenedAt: old },
        { customerId: 3, happenedAt: recent },
      ]);
      const result = await service.detectIdleCustomers(1, 30);
      // userId 范围查询参数正确传递（未联系内部按 createdAt 升序，稳定排序保持最早建立优先）
      expect(customers.find).toHaveBeenCalledWith({ where: { userId: 1 }, order: { createdAt: 'ASC' } });
      expect(activities.find).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(result.count).toBe(2);
      expect(result.items[0].customerId).toBe(2); // 从未联系最优先
      expect(result.items[0].neverContacted).toBe(true);
      expect(result.items[0].lastContactAt).toBeNull();
      expect(result.items[1].customerId).toBe(1); // 40 天未联系命中
      expect(result.items[1].idleDays).toBe(40);
      expect(result.items[1].lastContactAt).not.toBeNull();
      // 10 天内活跃客户不命中；他人客户本就不在结果集
      expect(result.items.find((i: any) => i.customerId === 3)).toBeUndefined();
    });

    it('limit 钳制 ≤50，且 minIdleDays 生效（阈值更大时少命中）', async () => {
      const old = new Date(Date.now() - 40 * 86400000);
      const mid = new Date(Date.now() - 20 * 86400000);
      customers.find.mockResolvedValue([
        { id: 1, name: 'A', status: 'active', riskLevel: 'low', userId: 1 },
        { id: 2, name: 'B', status: 'active', riskLevel: 'low', userId: 1 },
      ]);
      activities.find.mockResolvedValue([
        { customerId: 1, happenedAt: old },
        { customerId: 2, happenedAt: mid },
      ]);
      const strict = await service.detectIdleCustomers(1, 30);
      expect(strict.count).toBe(1); // 仅 40 天的命中
      expect(strict.items[0].customerId).toBe(1);
      const loose = await service.detectIdleCustomers(1, 10, 999);
      expect(loose.count).toBe(2);
      expect(loose.items.length).toBeLessThanOrEqual(50); // limit 钳制到 50
    });

    it('命中数超 limit：count 报真实存量（截断前），未联系内部按 createdAt 升序（最早建立优先）', async () => {
      const base = Date.now() - 90 * 86400000;
      customers.find.mockResolvedValue([
        { id: 3, name: 'C', status: 'lead', riskLevel: 'low', userId: 1, createdAt: new Date(base + 20 * 86400000) },
        { id: 1, name: 'A', status: 'lead', riskLevel: 'low', userId: 1, createdAt: new Date(base) },
        { id: 2, name: 'B', status: 'lead', riskLevel: 'low', userId: 1, createdAt: new Date(base + 10 * 86400000) },
      ]);
      activities.find.mockResolvedValue([]);
      const result = await service.detectIdleCustomers(1, 30, 2);
      // count = 真实命中存量（3），截断只影响 items
      expect(result.count).toBe(3);
      expect(result.items.length).toBe(2);
      // 全部从未联系 → 最早建立（id1）最优先，其次 id2
      expect(result.items.map((i: any) => i.customerId)).toEqual([1, 2]);
    });
  });

  it('listCustomers 状态/风险/关键词过滤 + 分页钳制', async () => {
    const qb: any = {
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getManyAndCount: jest.fn().mockResolvedValue([[customer(1)], 1]),
    };
    const whereSpy = jest.fn(() => qb);
    customers.createQueryBuilder.mockReturnValue({ ...qb, where: whereSpy });

    const result = await service.listCustomers(1, { status: 'active', riskLevel: 'high', keyword: 'Acme', page: 2, limit: 500 });
    expect(result.items).toHaveLength(1);
    expect(qb.take).toHaveBeenCalledWith(100); // limit 钳到 100
    expect(qb.andWhere).toHaveBeenCalledWith('c.status = :status', { status: 'active' });
    expect(qb.andWhere).toHaveBeenCalledWith('c.riskLevel = :riskLevel', { riskLevel: 'high' });
    expect(qb.andWhere).toHaveBeenCalledWith('(c.name LIKE :kw OR c.company LIKE :kw OR c.email LIKE :kw)', { kw: '%Acme%' });
  });

  it('updateCustomer 合并字段并保存', async () => {
    const entity = { ...customer(1), name: '旧' };
    customers.findOne.mockResolvedValue(entity);
    customers.save.mockImplementation(async (e: any) => e);
    const result = await service.updateCustomer(1, { name: '新' } as any, ownerAbility(1));
    expect(result.name).toBe('新');
    expect(customers.save).toHaveBeenCalled();
  });

  it('getCustomerDetail 聚合子资源（按 userId 隔离）', async () => {
    customers.findOne.mockResolvedValue(customer(1));
    orders.find.mockResolvedValue([{ id: 1, amount: 100 }]);
    activities.find.mockResolvedValue([{ id: 1, note: 'x' }]);
    tasks.find.mockResolvedValue([{ id: 1, title: 'T' }]);
    risks.find.mockResolvedValue([{ id: 1, level: 'high' }]);
    const detail = await service.getCustomerDetail(1, ownerAbility(1));
    expect(detail.customer.id).toBe(1);
    expect(detail.orders).toHaveLength(1);
    expect(detail.activities).toHaveLength(1);
    expect(detail.tasks).toHaveLength(1);
    expect(detail.risks).toHaveLength(1);
    // 子资源按 customerId + userId 过滤
    expect(orders.find).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: 1, userId: 1 } }));
  });

  it('订单/跟进列表与创建委托 service', async () => {
    orders.find.mockResolvedValue([{ id: 1 }]);
    await expect(service.listOrders(1, 1)).resolves.toHaveLength(1);
    orders.create.mockImplementation((d: any) => d);
    await service.createOrder(1, { amount: 100 } as any, 1);
    expect(orders.save).toHaveBeenCalledWith(expect.objectContaining({ customerId: 1, userId: 1, amount: 100 }));

    activities.find.mockResolvedValue([{ id: 1 }]);
    await expect(service.listActivities(1, 1)).resolves.toHaveLength(1);
    activities.create.mockImplementation((d: any) => d);
    await service.createActivity(1, { note: '跟进' } as any, 1);
    expect(activities.save).toHaveBeenCalledWith(expect.objectContaining({ customerId: 1, userId: 1, happenedAt: expect.any(Date) }));
  });

  it('listTasks 带/不带客户过滤', async () => {
    tasks.findAndCount.mockResolvedValue([[{ id: 1 }], 1]);
    const withCustomer = await service.listTasks(1, 1);
    expect(withCustomer.items).toHaveLength(1);
    expect(tasks.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 1, customerId: 1 } }));
    await service.listTasks(1);
    expect(tasks.findAndCount).toHaveBeenLastCalledWith(expect.objectContaining({ where: { userId: 1 } }));
  });

  it('风险列表/创建委托 service', async () => {
    risks.find.mockResolvedValue([{ id: 1 }]);
    await expect(service.listRisks(1, 1)).resolves.toHaveLength(1);
    risks.create.mockImplementation((d: any) => d);
    await service.createRisk(1, { level: 'high', description: 'x' } as any, 1);
    expect(risks.save).toHaveBeenCalledWith(expect.objectContaining({ customerId: 1, userId: 1, level: 'high' }));
  });

  describe('Opportunity（Customer 360）', () => {
    it('创建销售机会归属客户与 userId', async () => {
      opportunities.create.mockImplementation((d: any) => d);
      await service.createOpportunity(1, { name: 'Q3 续约扩展', amount: 200000 } as any, 1);
      expect(opportunities.save).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 1, userId: 1, name: 'Q3 续约扩展', amount: 200000 }),
      );
    });

    it('列表需所有权（他人客户 → 404）', async () => {
      await expect(service.listOpportunities(1, 2)).rejects.toThrow('无权');
    });

    it('更新/删除需所有权（他人客户 → 404）', async () => {
      await expect(service.updateOpportunity(1, 9, { name: 'x', amount: 1 } as any, 2)).rejects.toThrow('无权');
      await expect(service.removeOpportunity(1, 9, 2)).rejects.toThrow('无权');
    });

    it('getCustomerDetail 聚合含机会', async () => {
      opportunities.find.mockResolvedValue([{ id: 5, name: '在谈机会', amount: 50000 }]);
      const detail = await service.getCustomerDetail(1, { cannot: () => false } as any);
      expect(detail.opportunities).toHaveLength(1);
    });
  });

  describe('Contact（Customer 360）', () => {
    it('创建联系人归属客户与 userId', async () => {
      contacts.create.mockImplementation((d: any) => d);
      await service.createContact(1, { name: '张总', role: '决策人' } as any, 1);
      expect(contacts.save).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 1, userId: 1, name: '张总', role: '决策人' }),
      );
    });

    it('列表/更新/删除需所有权（他人客户 → 404）', async () => {
      await expect(service.listContacts(1, 2)).rejects.toThrow('无权');
      await expect(service.updateContact(1, 9, { name: 'x' } as any, 2)).rejects.toThrow('无权');
      await expect(service.removeContact(1, 9, 2)).rejects.toThrow('无权');
    });

    it('getCustomer360Data 聚合含联系人', async () => {
      contacts.find.mockResolvedValue([{ id: 3, name: '李经理', isPrimary: true }]);
      const data = await service.getCustomer360Data(1, 1);
      expect(data.contacts).toHaveLength(1);
    });
  });

  describe('getDashboard（AI Intelligence Dashboard）', () => {
    it('聚合客户/风险/管道/逾期/跟进', async () => {
      customers.find.mockResolvedValue([{ riskLevel: 'low' }, { riskLevel: 'high' }]);
      opportunities.find.mockResolvedValue([
        { amount: 100000, stage: 'negotiation', probability: 70, expectedCloseDate: new Date(Date.now() + 5 * 86400000) },
        { amount: 50000, stage: 'won', probability: 100, expectedCloseDate: null },
        { amount: 30000, stage: 'lost', probability: 0, expectedCloseDate: null },
      ]);
      orders.find.mockResolvedValue([{ status: 'overdue' }, { status: 'paid' }]);
      tasks.find.mockResolvedValue([{ status: 'pending' }, { status: 'completed' }]);
      risks.find.mockResolvedValue([{ resolvedAt: null }, { resolvedAt: new Date() }]);

      const d = await service.getDashboard(1);

      expect(d.customers).toBe(2);
      expect(d.highRiskCustomers).toBe(1);
      expect(d.opportunities).toBe(3);
      expect(d.pipelineAmount).toBe(100000); // 仅 negotiation 在谈
      expect(d.weightedAmount).toBe(70000); // 100000 × 0.7
      expect(d.soonClosing).toBe(1); // 5 天内到期
      expect(d.overdueOrders).toBe(1);
      expect(d.openTasks).toBe(1);
      expect(d.openRisks).toBe(1);
    });
  });
});
