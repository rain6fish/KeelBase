// SPDX-License-Identifier: Apache-2.0

import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('ReportsController', () => {
  let controller: ReportsController;
  let service: jest.Mocked<
    Pick<ReportsService, 'create' | 'findAll' | 'findAllForAdmin' | 'update' | 'remove' | 'removeAsAdmin'>
  >;

  const mockUser = { sub: 1, username: 'alex' };
  const mockAbility = { cannot: () => false } as any;
  const mockEntity = { id: 1 } as any;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findAllForAdmin: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      removeAsAdmin: jest.fn(),
    };
    controller = new ReportsController(service as unknown as ReportsService);
  });

  it('create 委托 service.create 并传入 userId', async () => {
    service.create.mockResolvedValue(mockEntity as never);
    const dto = {};
    await expect(controller.create(dto as any, mockUser as any)).resolves.toBe(mockEntity);
    expect(service.create).toHaveBeenCalledWith(dto, 1);
  });

  it('findAll 委托 service.findAll，并传入 userId 与 q', async () => {
    service.findAll.mockResolvedValue([mockEntity] as never);
    await expect(controller.findAll(mockUser as any)).resolves.toEqual([mockEntity]);
    expect(service.findAll).toHaveBeenCalledWith(1, undefined);
  });

  it('findAll 把 q 原样交给 service —— 过滤由它施加', async () => {
    service.findAll.mockResolvedValue([] as never);
    await controller.findAll(mockUser as any, 'term');
    expect(service.findAll).toHaveBeenCalledWith(1, 'term');
  });

  it('findAllForAdmin 委托 service.findAllForAdmin（管理端全量）', async () => {
    service.findAllForAdmin.mockResolvedValue([mockEntity] as never);
    await expect(controller.findAllForAdmin()).resolves.toEqual([mockEntity]);
    expect(service.findAllForAdmin).toHaveBeenCalled();
  });

  it('update 委托 service.update 并传入 ability 与 userId', async () => {
    service.update.mockResolvedValue(mockEntity as never);
    const dto = {};
    await expect(controller.update(1, dto as any, mockUser as any, mockAbility)).resolves.toBe(mockEntity);
    expect(service.update).toHaveBeenCalledWith(1, dto, mockAbility, 1);
  });

  it('remove 委托 service.remove 并返回 null', async () => {
    service.remove.mockResolvedValue(undefined as never);
    await expect(controller.remove(1, mockUser as any, mockAbility)).resolves.toBeNull();
    expect(service.remove).toHaveBeenCalledWith(1, mockAbility, 1);
  });

  it('removeAsAdmin 委托 service.removeAsAdmin 并返回 null', async () => {
    service.removeAsAdmin.mockResolvedValue(undefined as never);
    await expect(controller.removeAsAdmin(1)).resolves.toBeNull();
    expect(service.removeAsAdmin).toHaveBeenCalledWith(1);
  });
});
