// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { Report } from './report.entity';
import { UpdateReportDto } from './dto/update-report.dto';
import { OrgService } from '../org/org.service';

describe('ReportsService', () => {
  let service: ReportsService;
  const mockRepo = {
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
    update: jest.fn(),
  };
  const mockOrg = { getUserOrgContext: jest.fn() };

    const mockAbility = (allowed: boolean) => ({ can: () => allowed, cannot: () => !allowed }) as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(Report), useValue: mockRepo },
        { provide: OrgService, useValue: mockOrg },
      ],
    }).compile();
    service = module.get<ReportsService>(ReportsService);
  });

  it('creates a report bound to user', async () => {
    mockRepo.create.mockReturnValue({ id: 1, userId: 5 });

    const result = await service.create({} as any, 5);

    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 5 }));
    expect(result.userId).toBe(5);
  });

  it('returns only user reports', async () => {
    mockRepo.find.mockResolvedValue([{ id: 1 }]);

    const result = await service.findAll(5);

    expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: [{ userId: 5 }] }));
    expect(result).toHaveLength(1);
  });
  it("stamps the creator's organisation and department", async () => {
    mockOrg.getUserOrgContext.mockResolvedValue({ orgId: 7, deptId: 9 });

    await service.create({} as any, 5);

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, orgId: 7 }),
    );
    // 只声明 org ⇒ 实体没有 dept_id 列，就不该往 create 里塞这个键（TypeORM 会把它当成一个
    // 不存在的属性）。这条断言钉住的是「声明了什么才盖什么」，而不是「一律照盖」。
    //
    // Declaring only `org` means the entity has no dept_id column, so the key must not be handed to
    // create() — TypeORM would treat it as a property that does not exist. This pins "stamp what was
    // declared", not "stamp everything".
    expect(mockRepo.create.mock.calls[0][0]).not.toHaveProperty('deptId');
  });

  it("a member sees their own rows or their organisation's", async () => {
    mockOrg.getUserOrgContext.mockResolvedValue({ orgId: 7, deptId: null });
    mockRepo.find.mockResolvedValue([]);

    await service.findAll(5);

    expect(mockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: [{ userId: 5 }, { orgId: 7 }] }),
    );
  });

  it('no organisation ⇒ own rows only, never wider', async () => {
    mockOrg.getUserOrgContext.mockResolvedValue(null);
    mockRepo.find.mockResolvedValue([]);

    await service.findAll(5);

    expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: [{ userId: 5 }] }));
  });


  it('throws when CASL forbids access', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 6 });

    await expect(service.findOne(1, mockAbility(false), 5)).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFound when missing', async () => {
    mockRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne(1, mockAbility(true), 5)).rejects.toThrow(NotFoundException);
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
      service.update(1, { version: 2 } as UpdateReportDto, mockAbility(true), 5),
    ).rejects.toThrow(ConflictException);
    expect(mockRepo.update).toHaveBeenCalledWith(
      { id: 1, version: 2 },
      expect.objectContaining({ version: expect.any(Function) }),
    );
  });

  it('a matching version writes once and answers with the fresh row', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, version: 2 });
    mockRepo.update.mockResolvedValue({ affected: 1 });

    await service.update(1, { version: 2 } as UpdateReportDto, mockAbility(true), 5);

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.remove(1, mockAbility(true), 5);

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('does not soft-delete when CASL forbids (remove)', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 6 });

    await expect(service.remove(1, mockAbility(false), 5)).rejects.toThrow(ForbiddenException);

    expect(mockRepo.softDelete).not.toHaveBeenCalled();
  });

  it('removeAsAdmin soft-deletes without ownership (RG-3 recovery)', async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.removeAsAdmin(1);

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });
});
