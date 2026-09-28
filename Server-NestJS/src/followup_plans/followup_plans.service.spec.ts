// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FollowupPlansService } from './followup_plans.service';
import { FollowupPlan } from './followup_plan.entity';
import { UpdateFollowupPlanDto } from './dto/update-followup_plan.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 今天的 UTC 日期：date-only 入参按 UTC 零点解析，两侧同源。 */
const utcDay = (at: Date) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
const isoDay = (at: Date) => at.toISOString().slice(0, 10);
/** 一条满足前提的 create 入参：指向客户，跟进日在窗口内。 */
const validCreate = (over: Record<string, unknown> = {}) => ({
  title: '跟进 A 客户',
  priority: 'high',
  status: 'planned',
  customerId: 7,
  dueDate: isoDay(new Date(utcDay(new Date()).getTime() + DAY_MS)),
  ...over,
});

describe('FollowupPlansService', () => {
  let service: FollowupPlansService;
  const mockRepo = {
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  };

    const mockAbility = (allowed: boolean) => ({ cannot: () => !allowed }) as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowupPlansService,
        { provide: getRepositoryToken(FollowupPlan), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<FollowupPlansService>(FollowupPlansService);
  });

  it('creates a followup_plan bound to user', async () => {
    mockRepo.create.mockReturnValue({ id: 1, userId: 5 });
    mockRepo.count.mockResolvedValue(0);

    const result = await service.create(validCreate() as any, 5);

    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 5 }));
    expect(result.userId).toBe(5);
  });

  it('returns only user followup_plans', async () => {
    mockRepo.find.mockResolvedValue([{ id: 1 }]);

    const result = await service.findAll(5);

    expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 5 } }));
    expect(result).toHaveLength(1);
  });

  it('throws when CASL forbids access', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });

    await expect(service.findOne(1, mockAbility(false))).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFound when missing', async () => {
    mockRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne(1, mockAbility(true))).rejects.toThrow(NotFoundException);
  });

  it('refuses a stale update with 409 instead of overwriting silently', async () => {
    // The caller read version 2 while the row has moved to 3, so the conditional update matches
    // nothing. Zero rows affected is the conflict — the update must have carried the version.
    //
    // 调用方读到版本 2，而行已走到 3，于是条件更新一条也没匹配上。「影响 0 行」即冲突 ——
    // 前提是那条更新确实把版本带进了条件。
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, version: 3 });
    mockRepo.update.mockResolvedValue({ affected: 0 });

    await expect(
      service.update(1, { version: 2 } as UpdateFollowupPlanDto, mockAbility(true)),
    ).rejects.toThrow(ConflictException);
    expect(mockRepo.update).toHaveBeenCalledWith(
      { id: 1, version: 2 },
      expect.objectContaining({ version: expect.any(Function) }),
    );
  });

  it('a matching version writes once and answers with the fresh row', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, version: 2 });
    mockRepo.update.mockResolvedValue({ affected: 1 });

    await service.update(1, { version: 2 } as UpdateFollowupPlanDto, mockAbility(true));

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.remove(1, mockAbility(true));

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('does not soft-delete when CASL forbids (remove)', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });

    await expect(service.remove(1, mockAbility(false))).rejects.toThrow(ForbiddenException);

    expect(mockRepo.softDelete).not.toHaveBeenCalled();
  });

  // ── Business Spec 的手写规则（`unmapped` 项：薄协议表达不了业务规则） ────────────────
  describe('手写规则：两条前提 + Rule 1 / Rule 2', () => {
    it('拒绝没有客户的计划（Rule 1 的前提）', async () => {
      await expect(service.create(validCreate({ customerId: undefined }) as any, 5)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('拒绝没有计划跟进日的计划（Rule 2 的前提）', async () => {
      await expect(service.create(validCreate({ dueDate: undefined }) as any, 5)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Rule 2：未来 7 天内才放行（含今天与第 7 天，隔夜与第 8 天都拒）', async () => {
      mockRepo.count.mockResolvedValue(0);
      const today = utcDay(new Date());
      const day = (n: number) => isoDay(new Date(today.getTime() + n * DAY_MS));

      for (const ok of [0, 7]) {
        await expect(service.create(validCreate({ dueDate: day(ok) }) as any, 5)).resolves.toBeTruthy();
      }
      for (const bad of [-1, 8]) {
        await expect(service.create(validCreate({ dueDate: day(bad) }) as any, 5)).rejects.toThrow(
          BadRequestException,
        );
      }
    });

    it('Rule 1：同客户同周已计划过 → 409，且查询落在「跟进日所在自然周」的窗口内', async () => {
      mockRepo.count.mockResolvedValue(1);
      const due = isoDay(new Date(utcDay(new Date()).getTime() + DAY_MS));

      await expect(service.create(validCreate({ dueDate: due }) as any, 5)).rejects.toThrow(
        ConflictException,
      );

      const where = mockRepo.count.mock.calls[0][0].where;
      expect(where.userId).toBe(5); // 范围按 owner 收窄：计划归创建的销售本人
      expect(where.customerId).toBe(7);
      const [from, to] = where.dueDate.value as [Date, Date];
      expect(from.getUTCDay()).toBe(1); // 周一为界
      expect(to.getTime() - from.getTime()).toBe(7 * DAY_MS - 1);
      const at = new Date(due).getTime();
      expect(at).toBeGreaterThanOrEqual(from.getTime());
      expect(at).toBeLessThanOrEqual(to.getTime());
    });

    it('Rule 1：本周没有同客户计划时放行', async () => {
      mockRepo.count.mockResolvedValue(0);

      await expect(service.create(validCreate() as any, 5)).resolves.toBeTruthy();
      expect(mockRepo.count).toHaveBeenCalledTimes(1);
    });
  });

  it('removeAsAdmin soft-deletes without ownership (RG-3 recovery)', async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.removeAsAdmin(1);

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });
});
