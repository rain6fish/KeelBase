// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LeaveRequestsService } from './leave_requests.service';
import { LeaveRequest } from './leave_request.entity';
import { UpdateLeaveRequestDto } from './dto/update-leave_request.dto';

describe('LeaveRequestsService', () => {
  let service: LeaveRequestsService;
  const mockRepo = {
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
    update: jest.fn(),
  };

    const mockAbility = (allowed: boolean) => ({ cannot: () => !allowed }) as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveRequestsService,
        { provide: getRepositoryToken(LeaveRequest), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<LeaveRequestsService>(LeaveRequestsService);
  });

  it('creates a leave_request bound to user', async () => {
    mockRepo.create.mockReturnValue({ id: 1, userId: 5 });

    const result = await service.create({} as any, 5);

    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 5 }));
    expect(result.userId).toBe(5);
  });

  it('create 一律写 pending —— 客户端夹带 status 也不生效', async () => {
    // The DTO no longer accepts `status`; this keeps the invariant if the DTO ever changes again.
    // DTO 已不接受 `status`；这一行让不变量在 DTO 再变时仍然成立。
    mockRepo.create.mockReturnValue({ id: 1, userId: 5, status: 'pending' });

    await service.create({ requestNo: 'r-1', status: 'approved' } as any, 5);

    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', userId: 5 }));
  });

  it('非管理员不能改审批状态（自批被拒）', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, version: 1 });
    // Can read (so the row is found), cannot manage all (so approval is not theirs).
    // 能读（找得到行），不能 manage all（审批不归他）。
    const readerAbility = { cannot: (action: string) => action === 'manage' } as any;

    await expect(
      service.update(1, { version: 1, status: 'approved' } as UpdateLeaveRequestDto, readerAbility),
    ).rejects.toThrow(ForbiddenException);
  });

  it('管理员可以改审批状态', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, version: 1 });
    mockRepo.update.mockResolvedValue({ affected: 1 });
    const adminAbility = { cannot: () => false } as any;

    await service.update(1, { version: 1, status: 'approved' } as UpdateLeaveRequestDto, adminAbility);

    expect(mockRepo.update).toHaveBeenCalledWith(
      { id: 1, version: 1 },
      expect.objectContaining({ status: 'approved' }),
    );
  });

  it('returns only user leave_requests', async () => {
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
      service.update(1, { version: 2 } as UpdateLeaveRequestDto, mockAbility(true)),
    ).rejects.toThrow(ConflictException);
    expect(mockRepo.update).toHaveBeenCalledWith(
      { id: 1, version: 2 },
      expect.objectContaining({ version: expect.any(Function) }),
    );
  });

  it('a matching version writes once and answers with the fresh row', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, version: 2 });
    mockRepo.update.mockResolvedValue({ affected: 1 });

    await service.update(1, { version: 2 } as UpdateLeaveRequestDto, mockAbility(true));

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

  it('removeAsAdmin soft-deletes without ownership (RG-3 recovery)', async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.removeAsAdmin(1);

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });
});
