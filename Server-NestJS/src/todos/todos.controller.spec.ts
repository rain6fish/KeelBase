import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';
import { Todo } from './todo.entity';

describe('TodosController', () => {
  let controller: TodosController;
  let service: jest.Mocked<Pick<TodosService, 'create' | 'findAll' | 'findOne' | 'update' | 'remove'>>;

  const mockUser = { sub: 1, username: 'alex' };
  const mockAbility = { cannot: () => false } as any;
  const mockTodo = { id: 1, title: '买牛奶', completed: false, userId: 1 } as Todo;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new TodosController(service as unknown as TodosService);
  });

  describe('create', () => {
    it('委托 service.create 并传入 userId', async () => {
      service.create.mockResolvedValue(mockTodo as never);
      const dto = { title: '买牛奶', dueDate: '2026-08-16' };
      await expect(controller.create(dto as any, mockUser as any)).resolves.toBe(mockTodo);
      expect(service.create).toHaveBeenCalledWith(dto, 1);
    });
  });

  describe('findAll', () => {
    it('委托 service.findAll 并传入 userId', async () => {
      service.findAll.mockResolvedValue([mockTodo] as never);
      await expect(controller.findAll(mockUser as any)).resolves.toEqual([mockTodo]);
      expect(service.findAll).toHaveBeenCalledWith(1);
    });
  });

  describe('update', () => {
    it('委托 service.update 并传入 ability', async () => {
      service.update.mockResolvedValue({ ...mockTodo, title: '改标题' } as never);
      const dto = { title: '改标题' };
      await expect(controller.update(1, dto as any, mockUser as any, mockAbility)).resolves.toMatchObject({ title: '改标题' });
      expect(service.update).toHaveBeenCalledWith(1, dto, mockAbility);
    });
  });

  describe('toggleComplete', () => {
    it('先查后翻转 completed 状态', async () => {
      service.findOne.mockResolvedValue(mockTodo as never);
      service.update.mockResolvedValue({ ...mockTodo, completed: true } as never);
      await controller.toggleComplete(1, mockUser as any, mockAbility);
      expect(service.findOne).toHaveBeenCalledWith(1, mockAbility);
      expect(service.update).toHaveBeenCalledWith(1, { completed: true }, mockAbility);
    });
  });

  describe('remove', () => {
    it('委托 service.remove 并返回 null', async () => {
      service.remove.mockResolvedValue(undefined as never);
      await expect(controller.remove(1, mockUser as any, mockAbility)).resolves.toBeNull();
      expect(service.remove).toHaveBeenCalledWith(1, mockAbility);
    });
  });
});
