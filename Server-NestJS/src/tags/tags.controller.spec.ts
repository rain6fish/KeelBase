import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

describe('TagsController', () => {
  let controller: TagsController;
  let service: jest.Mocked<Pick<TagsService, 'create' | 'findAll' | 'findAllForAdmin' | 'update' | 'remove' | 'removeAsAdmin'>>;

  const mockUser = { sub: 1, username: 'alex' };
  const mockAbility = { cannot: () => false } as any;
  const mockTag = { id: 1, name: '工作', userId: 1 };

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findAllForAdmin: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      removeAsAdmin: jest.fn(),
    };
    controller = new TagsController(service as unknown as TagsService);
  });

  it('findAllForAdmin 委托 service', async () => {
    service.findAllForAdmin.mockResolvedValue([mockTag] as never);
    await expect(controller.findAllForAdmin()).resolves.toEqual([mockTag]);
    expect(service.findAllForAdmin).toHaveBeenCalled();
  });

  it('removeAsAdmin 委托 service 并返回 null', async () => {
    service.removeAsAdmin.mockResolvedValue(undefined as never);
    await expect(controller.removeAsAdmin(1)).resolves.toBeNull();
    expect(service.removeAsAdmin).toHaveBeenCalledWith(1);
  });

  it('create 委托 service 并传 userId', async () => {
    service.create.mockResolvedValue(mockTag as never);
    const dto = { name: '工作', color: '#ff0000' };
    await expect(controller.create(dto as any, mockUser as any)).resolves.toBe(mockTag);
    expect(service.create).toHaveBeenCalledWith(dto, 1);
  });

  it('findAll 委托 service 并传 userId', async () => {
    service.findAll.mockResolvedValue([mockTag] as never);
    await expect(controller.findAll(mockUser as any)).resolves.toEqual([mockTag]);
    expect(service.findAll).toHaveBeenCalledWith(1);
  });

  it('update 委托 service 并传 ability', async () => {
    service.update.mockResolvedValue({ ...mockTag, name: '生活' } as never);
    const dto = { name: '生活' };
    await expect(controller.update(1, dto as any, mockUser as any, mockAbility)).resolves.toMatchObject({ name: '生活' });
    expect(service.update).toHaveBeenCalledWith(1, dto, mockAbility);
  });

  it('remove 委托 service 并返回 null', async () => {
    service.remove.mockResolvedValue(undefined as never);
    await expect(controller.remove(1, mockUser as any, mockAbility)).resolves.toBeNull();
    expect(service.remove).toHaveBeenCalledWith(1, mockAbility);
  });
});
