// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotesService } from './notes.service';
import { Note } from './note.entity';

describe('NotesService', () => {
  let service: NotesService;
  const mockRepo = {
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
  };

  const mockAbility = (allowed: boolean) => ({ cannot: () => !allowed }) as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: getRepositoryToken(Note), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<NotesService>(NotesService);
  });

  it('creates a note bound to user', async () => {
    mockRepo.create.mockReturnValue({ id: 1, userId: 5 });

    const result = await service.create({} as any, 5);

    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 5 }));
    expect(result.userId).toBe(5);
  });

  it('returns only user notes', async () => {
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

  it('soft-deletes', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.remove(1, mockAbility(true));

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('returns entity when CASL allows', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });

    await expect(service.findOne(1, mockAbility(true))).resolves.toEqual({ id: 1, userId: 5 });
  });

  it('findAllForAdmin 全量列表（无 userId 过滤）', async () => {
    mockRepo.find.mockResolvedValue([{ id: 2, userId: 9 }]);
    const result = await service.findAllForAdmin();
    expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({ order: { createdAt: 'DESC' } }));
    expect(result).toHaveLength(1);
  });

  it('removeAsAdmin 软删任意笔记', async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });
    await service.removeAsAdmin(3);
    expect(mockRepo.softDelete).toHaveBeenCalledWith(3);
  });

  it('update 合并字段并保存', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, title: '旧' });
    mockRepo.save.mockImplementation(async (d: any) => d);

    const result = await service.update(1, { title: '新' } as any, mockAbility(true));

    expect(result).toEqual(expect.objectContaining({ id: 1, title: '新' }));
    expect(mockRepo.save).toHaveBeenCalled();
  });
});
