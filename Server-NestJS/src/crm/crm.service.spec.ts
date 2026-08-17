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

  const customer = (id: number, userId = 1, overrides: Partial<CrmCustomer> = {}) =>
    ({ id, name: `客户${id}`, status: 'active', riskLevel: 'low', userId, ...overrides }) as CrmCustomer;

  beforeEach(() => {
    customers = makeRepo([customer(1), customer(2, 2)]);
    orders = makeRepo([]);
    activities = makeRepo([]);
    tasks = makeRepo([]);
    risks = makeRepo([]);
    service = new CrmService(
      customers as any, orders as any, activities as any, tasks as any, risks as any,
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
});
