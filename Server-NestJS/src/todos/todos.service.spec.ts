import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TodosService } from './todos.service';
import { Todo } from './todo.entity';

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

  const mockAbility = (allowed: boolean) => ({ cannot: () => !allowed }) as any;

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
});
