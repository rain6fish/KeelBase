import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { ApprovalService } from './approval.service';

type AppAbility = MongoAbility<['manage' | 'read' | 'update' | 'delete', string | Record<string, any>]>;

function ownerAbility(userId: number): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  can('manage', 'ApprovalRequest', { requesterId: userId });
  can('manage', 'ApprovalPolicy', { userId });
  return build();
}

function makeRepo<T>(rows: T[] = []) {
  return {
    create: jest.fn((d: Partial<T>) => d as T),
    save: jest.fn(async (e: any) => e),
    findOne: jest.fn(async ({ where }: any = {}) =>
      rows.find((r: any) => Object.entries(where ?? {}).every(([k, v]) => (r as any)[k] === v)) ?? null,
    ),
    find: jest.fn(async () => rows),
    findAndCount: jest.fn(async () => [rows, rows.length]),
    count: jest.fn(async () => rows.length),
    softDelete: jest.fn(),
    delete: jest.fn(),
  } as unknown as jest.Mocked<Repository<any>>;
}

describe('ApprovalService', () => {
  let service: ApprovalService;
  let requests: any;
  let policies: any;

  const request = (id: number, userId = 1, overrides: Record<string, unknown> = {}) =>
    ({ id, title: `申请${id}`, type: 'reimbursement', amount: 500, reason: 'r', status: 'pending', riskLevel: 'low', requesterId: userId, ...overrides });

  beforeEach(() => {
    requests = makeRepo([request(1), request(2, 2)]);
    policies = makeRepo([{ id: 1, type: 'reimbursement', maxAmount: 1000, active: true }]);
    service = new ApprovalService(requests as any, policies as any);
  });

  it('createRequest 归属 requesterId 且 pending', async () => {
    await service.createRequest({ title: '报销', amount: 800, reason: '差旅' } as any, 7);
    expect(requests.create).toHaveBeenCalledWith({ title: '报销', amount: 800, reason: '差旅', requesterId: 7, status: 'pending' });
  });

  it('getRequest 本人可读、非本人 Forbidden、不存在 NotFound', async () => {
    await expect(service.getRequest(1, ownerAbility(1))).resolves.toMatchObject({ id: 1 });
    await expect(service.getRequest(1, ownerAbility(9))).rejects.toThrow(ForbiddenException);
    await expect(service.getRequest(999, ownerAbility(1))).rejects.toThrow(NotFoundException);
  });

  describe('AI 预审（reviewRequest）', () => {
    it('金额 ≤ 政策阈值 → 自动通过 + low 风险 + 建议', async () => {
      requests.findOne.mockResolvedValue(request(1));
      const result = await service.reviewRequest(1, 1);
      expect(result.status).toBe('auto_approved');
      expect(result.riskLevel).toBe('low');
      expect(result.aiRecommendation).toContain('自动通过');
    });

    it('金额 > 阈值但 ≤ 3 倍 → medium 转人工复核', async () => {
      requests.findOne.mockResolvedValue(request(1, 1, { amount: 1500 }));
      const result = await service.reviewRequest(1, 1);
      expect(result.status).toBe('needs_review');
      expect(result.riskLevel).toBe('medium');
      expect(result.aiRecommendation).toContain('人工复核');
    });

    it('金额 > 3 倍阈值 → high 风险', async () => {
      requests.findOne.mockResolvedValue(request(1, 1, { amount: 5000, type: 'reimbursement' }));
      const result = await service.reviewRequest(1, 1);
      expect(result.riskLevel).toBe('high');
    });

    it('非 pending 请求不可预审', async () => {
      requests.findOne.mockResolvedValue(request(1, 1, { status: 'approved' }));
      await expect(service.reviewRequest(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('非本人请求 → NotFound', async () => {
      requests.findOne.mockImplementation(async ({ where }: any = {}) =>
        where?.requesterId === 2 ? request(2, 2) : null,
      );
      await expect(service.reviewRequest(2, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('人工复核（decideRequest）', () => {
    it('needs_review → approved', async () => {
      requests.findOne.mockResolvedValue(request(1, 1, { status: 'needs_review' }));
      const result = await service.decideRequest(1, 'approved', 1);
      expect(result.status).toBe('approved');
      expect(result.reviewerId).toBe(1);
      expect(result.decidedAt).toBeInstanceOf(Date);
    });

    it('非 needs_review 不可决定', async () => {
      requests.findOne.mockResolvedValue(request(1, 1, { status: 'pending' }));
      await expect(service.decideRequest(1, 'approved', 1)).rejects.toThrow(BadRequestException);
    });
  });

  it('listRequests 分页钳制 + 状态过滤', async () => {
    requests.findAndCount.mockResolvedValue([[request(1)], 1]);
    const result = await service.listRequests(1, { status: 'pending', page: 2, limit: 500 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(requests.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requesterId: 1, status: 'pending' }, skip: 100, take: 100 }),
    );
  });

  it('listRequests 无过滤时只按 requesterId', async () => {
    requests.findAndCount.mockResolvedValue([[request(1)], 1]);
    await service.listRequests(1);
    expect(requests.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { requesterId: 1 }, skip: 0, take: 20 }),
    );
  });

  it('removeRequest 软删本人请求', async () => {
    requests.findOne.mockResolvedValue(request(1));
    requests.softDelete.mockResolvedValue({ affected: 1 });
    await service.removeRequest(1, ownerAbility(1));
    expect(requests.softDelete).toHaveBeenCalledWith(1);
  });

  it('政策 CRUD：list/create/update/remove + NotFound', async () => {
    policies.find.mockResolvedValue([{ id: 1, type: 'reimbursement' }]);
    await expect(service.listPolicies(1)).resolves.toHaveLength(1);

    policies.create.mockImplementation((d: any) => d);
    await service.createPolicy({ name: '报销政策', type: 'reimbursement', maxAmount: 1000 } as any, 1);
    expect(policies.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, maxAmount: 1000 }));

    const policy = { id: 1, type: 'reimbursement', maxAmount: 1000, userId: 1 };
    policies.findOne.mockResolvedValue(policy);
    policies.save.mockImplementation(async (e: any) => e);
    const updated = await service.updatePolicy(1, { maxAmount: 2000 } as any, 1);
    expect(updated.maxAmount).toBe(2000);

    policies.delete.mockResolvedValue({ affected: 1 });
    await service.removePolicy(1, 1);
    expect(policies.delete).toHaveBeenCalledWith(1);

    policies.findOne.mockResolvedValue(null);
    await expect(service.updatePolicy(99, {} as any, 1)).rejects.toThrow(NotFoundException);
    await expect(service.removePolicy(99, 1)).rejects.toThrow(NotFoundException);
  });
});
