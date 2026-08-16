import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TodosService } from './todos.service';
import { Todo } from './todo.entity';
import { OrgService } from '../org/org.service';

describe('TodosService', () => {
  let service: TodosService;
  const mockRepo = {
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    softDelete: jest.fn(),
  };

  const mockAbility = (allowed: boolean) => ({
    cannot: () => !allowed,
    can: () => allowed,
  }) as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TodosService,
        { provide: getRepositoryToken(Todo), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<TodosService>(TodosService);
  });

  it('creates a todo bound to user', async () => {
    mockRepo.create.mockReturnValue({ id: 1, title: '买牛奶', userId: 5 });

    const result = await service.create({ title: '买牛奶' }, 5);

    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 5 }));
    expect(result.userId).toBe(5);
  });

  it('PL-14：创建待办发布 todo.created webhook', async () => {
    const webhook = { publish: jest.fn().mockResolvedValue(undefined) };
    const svc = new TodosService(mockRepo as any, undefined as any, webhook as any);
    mockRepo.create.mockReturnValue({ id: 9, title: 'T', userId: 1 });
    mockRepo.save.mockResolvedValue({ id: 9, title: 'T', userId: 1 });

    await svc.create({ title: 'T' }, 1);

    expect(webhook.publish).toHaveBeenCalledWith(
      'todo.created',
      expect.objectContaining({ todoId: 9, title: 'T', userId: 1 }),
    );
  });

  it('returns only user todos', async () => {
    mockRepo.find.mockResolvedValue([{ id: 1 }]);

    const result = await service.findAll(5);

    // ORG-3 二期：where 为数组（本人 OR 同组织）；无 orgService 时仅本人条件
    expect(mockRepo.find).toHaveBeenCalledWith({ where: [{ userId: 5 }], order: { completed: 'ASC', createdAt: 'DESC' } });
    expect(result).toHaveLength(1);
  });

  it('returns todo when CASL allows', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });

    const result = await service.findOne(1, mockAbility(true));

    expect(result.id).toBe(1);
  });

  it('throws when CASL forbids todo access', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });

    await expect(service.findOne(1, mockAbility(false))).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFound when todo missing', async () => {
    mockRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne(1, mockAbility(true))).rejects.toThrow(NotFoundException);
  });

  it('updates todo fields', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, title: '旧', completed: false });
    mockRepo.save.mockResolvedValue({ id: 1, userId: 5, title: '新', completed: true });

    const result = await service.update(1, { completed: true }, mockAbility(true));

    expect(result.completed).toBe(true);
  });

  it('soft-deletes todo', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.remove(1, mockAbility(true));

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });

  describe('ORG-3 组织级隔离一致性（A3）', () => {
    const noAccessAbility = { cannot: () => true, can: () => false } as any;
    let orgService: { getUserOrgId: jest.Mock };

    const buildService = async () => {
      jest.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TodosService,
          { provide: getRepositoryToken(Todo), useValue: mockRepo },
          { provide: OrgService, useValue: orgService },
        ],
      }).compile();
      return module.get<TodosService>(TodosService);
    };

    it('同组织成员可读他人待办（列表与明细一致）', async () => {
      orgService = { getUserOrgId: jest.fn().mockResolvedValue(7) };
      const s = await buildService();
      mockRepo.findOne.mockResolvedValue({ id: 2, userId: 99, orgId: 7 });

      const todo = await s.findOne(2, noAccessAbility, 5);
      expect(todo.id).toBe(2);
      expect(orgService.getUserOrgId).toHaveBeenCalledWith(5);
    });

    it('跨组织成员访问他人待办被拒（cross-org 负向）', async () => {
      orgService = { getUserOrgId: jest.fn().mockResolvedValue(8) };
      const s = await buildService();
      mockRepo.findOne.mockResolvedValue({ id: 2, userId: 99, orgId: 7 });

      await expect(s.findOne(2, noAccessAbility, 5)).rejects.toThrow(ForbiddenException);
    });

    it('未注入 orgService 时非本人待办不可见', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TodosService,
          { provide: getRepositoryToken(Todo), useValue: mockRepo },
        ],
      }).compile();
      const s = module.get<TodosService>(TodosService);
      mockRepo.findOne.mockResolvedValue({ id: 2, userId: 99, orgId: 7 });

      await expect(s.findOne(2, noAccessAbility, 5)).rejects.toThrow(ForbiddenException);
    });
  });
});
