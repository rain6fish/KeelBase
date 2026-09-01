// SPDX-License-Identifier: Apache-2.0

import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

describe('NotesController', () => {
  let controller: NotesController;
  let service: jest.Mocked<Pick<NotesService, 'create' | 'findAll' | 'findAllForAdmin' | 'update' | 'remove' | 'removeAsAdmin'>>;

  const mockUser = { sub: 1, username: 'alex' };
  const mockAbility = { cannot: () => false } as any;
  const mockNote = { id: 1, title: '会议记录', content: '……', userId: 1 };

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findAllForAdmin: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      removeAsAdmin: jest.fn(),
    };
    controller = new NotesController(service as unknown as NotesService);
  });

  it('findAllForAdmin 委托 service', async () => {
    service.findAllForAdmin.mockResolvedValue([mockNote] as never);
    await expect(controller.findAllForAdmin()).resolves.toEqual([mockNote]);
    expect(service.findAllForAdmin).toHaveBeenCalled();
  });

  it('removeAsAdmin 委托 service 并返回 null', async () => {
    service.removeAsAdmin.mockResolvedValue(undefined as never);
    await expect(controller.removeAsAdmin(1)).resolves.toBeNull();
    expect(service.removeAsAdmin).toHaveBeenCalledWith(1);
  });

  it('create 委托 service 并传 userId', async () => {
    service.create.mockResolvedValue(mockNote as never);
    const dto = { title: '会议记录', content: '……' };
    await expect(controller.create(dto as any, mockUser as any)).resolves.toBe(mockNote);
    expect(service.create).toHaveBeenCalledWith(dto, 1);
  });

  it('findAll 委托 service 并传 userId', async () => {
    service.findAll.mockResolvedValue([mockNote] as never);
    await expect(controller.findAll(mockUser as any)).resolves.toEqual([mockNote]);
    expect(service.findAll).toHaveBeenCalledWith(1);
  });

  it('update 委托 service 并传 ability', async () => {
    service.update.mockResolvedValue({ ...mockNote, title: '新标题' } as never);
    const dto = { title: '新标题' };
    await expect(controller.update(1, dto as any, mockUser as any, mockAbility)).resolves.toMatchObject({ title: '新标题' });
    expect(service.update).toHaveBeenCalledWith(1, dto, mockAbility);
  });

  it('remove 委托 service 并返回 null', async () => {
    service.remove.mockResolvedValue(undefined as never);
    await expect(controller.remove(1, mockUser as any, mockAbility)).resolves.toBeNull();
    expect(service.remove).toHaveBeenCalledWith(1, mockAbility);
  });
});
