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
});
