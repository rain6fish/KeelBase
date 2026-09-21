// SPDX-License-Identifier: Apache-2.0

import { Repository } from 'typeorm';
import { CrmAnalyticsService } from './crm-analytics.service';
import { CrmCustomer } from './crm-customer.entity';

/**
 * 分析域单测（阶段 3 第十三刀从 `crm.service.spec.ts` 整段搬来，**断言一字未改**）。
 */
function makeRepo<T>(rows: T[] = []) {
  return {
    create: jest.fn((d: Partial<T>) => d as T),
    save: jest.fn(async (e: any) => e),
    findOne: jest.fn(async ({ where }: any = {}) =>
      rows.find((r: any) =>
        Object.entries(where ?? {}).every(([k, v]) => (r as any)[k] === v),
      ) ?? null,
    ),
    find: jest.fn(async () => rows),
    findAndCount: jest.fn(async () => [rows, rows.length]),
    count: jest.fn(async () => rows.length),
  } as unknown as jest.Mocked<Repository<any>>;
}

describe('CrmAnalyticsService（AI CRM 分析域）', () => {
  let service: CrmAnalyticsService;
  let customers: any;
  let orders: any;
  let activities: any;
  let tasks: any;
  let risks: any;
  let opportunities: any;

  const customer = (id: number, userId = 1, overrides: Partial<CrmCustomer> = {}) =>
    ({ id, name: `客户${id}`, status: 'active', riskLevel: 'low', userId, ...overrides }) as CrmCustomer;

  beforeEach(() => {
    customers = makeRepo([customer(1), customer(2, 2)]);
    orders = makeRepo([]);
    activities = makeRepo([]);
    tasks = makeRepo([]);
    risks = makeRepo([]);
    opportunities = makeRepo([]);
    service = new CrmAnalyticsService(
      customers as any, orders as any, activities as any, tasks as any, risks as any, opportunities as any,
    );
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

  describe('listAllOpportunities（AI 管道分析）', () => {
    it('列出用户全部机会（跨客户聚合，AI 管道分析用）', async () => {
      opportunities.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const r = await service.listAllOpportunities(1);
      expect(r).toHaveLength(2);
      expect(opportunities.find).toHaveBeenCalledWith({ where: { userId: 1 }, order: { expectedCloseDate: 'ASC' } });
    });

  });
});
