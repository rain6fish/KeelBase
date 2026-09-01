// SPDX-License-Identifier: Apache-2.0

import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: jest.Mocked<Pick<UsersService, 'create' | 'findAll' | 'findOne' | 'update' | 'updateRole' | 'remove' | 'forceChangePassword'>>;
  let ability: { cannot: jest.Mock; can: jest.Mock };

  const mockUser = { sub: 1, username: 'alex' };
  const mockUserRecord = { id: 1, username: 'alex', role: 'user' };

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      updateRole: jest.fn(),
      remove: jest.fn(),
      forceChangePassword: jest.fn(),
    };
    ability = { cannot: jest.fn().mockReturnValue(false), can: jest.fn().mockReturnValue(false) };
    controller = new UsersController(service as unknown as UsersService);
  });

  describe('create', () => {
    it('委托 service.create', async () => {
      service.create.mockResolvedValue(mockUserRecord as never);
      const dto = { username: 'new', password: 'pass1234' };
      await expect(controller.create(dto as any)).resolves.toBe(mockUserRecord);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('使用合法 sort 字段', async () => {
      service.findAll.mockResolvedValue({ items: [], total: 0 } as never);
      await controller.findAll({ page: 1, limit: 20, sort: 'username', order: 'asc' } as any);
      expect(service.findAll).toHaveBeenCalledWith(1, 20, 'username', 'asc');
    });

    it('非法 sort 字段回退 createdAt，非法 order 回退 desc', async () => {
      service.findAll.mockResolvedValue({ items: [], total: 0 } as never);
      await controller.findAll({ page: 1, limit: 20, sort: "username; drop", order: 'evil' } as any);
      expect(service.findAll).toHaveBeenCalledWith(1, 20, 'createdAt', 'desc');
    });
  });

  describe('findOne', () => {
    it('无权限时抛 ForbiddenException', async () => {
      ability.cannot.mockReturnValue(true);
      await expect(controller.findOne(1, ability as any)).rejects.toThrow(ForbiddenException);
      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('有权限时查询，并按是否管理员传脱敏标志', async () => {
      ability.cannot.mockReturnValue(false);
      ability.can.mockReturnValue(true);
      service.findOne.mockResolvedValue(mockUserRecord as never);
      await expect(controller.findOne(1, ability as any)).resolves.toBe(mockUserRecord);
      expect(service.findOne).toHaveBeenCalledWith(1, true);
    });
  });

  describe('update', () => {
    it('无权限时抛 ForbiddenException', async () => {
      ability.cannot.mockReturnValue(true);
      const dto = { nickname: 'x' };
      await expect(controller.update(1, dto as any, ability as any)).rejects.toThrow(ForbiddenException);
    });

    it('有权限时委托 service.update', async () => {
      ability.cannot.mockReturnValue(false);
      const dto = { nickname: '新昵称' };
      service.update.mockResolvedValue({ ...mockUserRecord, nickname: '新昵称' } as never);
      await expect(controller.update(1, dto as any, ability as any)).resolves.toMatchObject({ nickname: '新昵称' });
      expect(service.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('updateRole', () => {
    it('修改自己的角色抛 BadRequestException', async () => {
      await expect(controller.updateRole(1, { role: 'admin' } as any, mockUser as any)).rejects.toThrow(BadRequestException);
      expect(service.updateRole).not.toHaveBeenCalled();
    });

    it('委托 service.updateRole', async () => {
      service.updateRole.mockResolvedValue({ ...mockUserRecord, role: 'admin' } as never);
      const adminUser = { sub: 9, username: 'admin', role: 'admin' };
      await expect(controller.updateRole(2, { role: 'admin' } as any, adminUser as any)).resolves.toMatchObject({ role: 'admin' });
      expect(service.updateRole).toHaveBeenCalledWith(2, 'admin');
    });
  });

  describe('remove', () => {
    it('删除自己抛 BadRequestException', async () => {
      await expect(controller.remove(1, mockUser as any, ability as any)).rejects.toThrow(BadRequestException);
    });

    it('无删除权限抛 ForbiddenException', async () => {
      ability.cannot.mockReturnValue(true);
      const other = { sub: 9, username: 'admin', role: 'admin' };
      await expect(controller.remove(2, other as any, ability as any)).rejects.toThrow(ForbiddenException);
    });

    it('正常删除返回 null', async () => {
      ability.cannot.mockReturnValue(false);
      service.remove.mockResolvedValue(undefined as never);
      const other = { sub: 9, username: 'admin', role: 'admin' };
      await expect(controller.remove(2, other as any, ability as any)).resolves.toBeNull();
      expect(service.remove).toHaveBeenCalledWith(2);
    });
  });

  describe('mustChangePassword', () => {
    it('委托 service.forceChangePassword', async () => {
      service.forceChangePassword.mockResolvedValue(mockUserRecord as never);
      const other = { sub: 1, username: 'admin' };
      await expect(controller.mustChangePassword(2, other as any)).resolves.toBe(mockUserRecord);
      expect(service.forceChangePassword).toHaveBeenCalledWith(2);
    });

    it('给自己设强制改密抛 BadRequestException', async () => {
      const self = { sub: 1, username: 'admin' };
      await expect(controller.mustChangePassword(1, self as any)).rejects.toThrow(BadRequestException);
      expect(service.forceChangePassword).not.toHaveBeenCalled();
    });
  });
});
