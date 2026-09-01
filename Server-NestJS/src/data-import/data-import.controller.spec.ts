// SPDX-License-Identifier: Apache-2.0

import { BadRequestException } from '@nestjs/common';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';
import { CHECK_POLICIES_KEY } from '../common/casl/check-policies.decorator';

describe('DataImportController', () => {
  let controller: DataImportController;
  let dataImport: Record<string, jest.Mock>;

  beforeEach(() => {
    dataImport = { importUsers: jest.fn(), importEvents: jest.fn(), importTodos: jest.fn() };
    controller = new DataImportController(dataImport as unknown as DataImportService);
  });

  it('导入用户委托 service（CSV 文本）', async () => {
    dataImport.importUsers.mockResolvedValue({ success: 2, failed: 1 });
    const file = { buffer: Buffer.from('username,email\n') } as Express.Multer.File;
    await expect(controller.importUsers(file)).resolves.toEqual({ success: 2, failed: 1 });
    expect(dataImport.importUsers).toHaveBeenCalledWith('username,email\n');
  });

  it('导入事件委托 service（CSV 文本）', async () => {
    dataImport.importEvents.mockResolvedValue({ success: 3, failed: 0 });
    const file = { buffer: Buffer.from('userId,title\n') } as Express.Multer.File;
    await expect(controller.importEvents(file)).resolves.toEqual({ success: 3, failed: 0 });
    expect(dataImport.importEvents).toHaveBeenCalledWith('userId,title\n');
  });

  it('导入待办委托 service（CSV 文本）', async () => {
    dataImport.importTodos.mockResolvedValue({ success: 1, failed: 2 });
    const file = { buffer: Buffer.from('userId,title\n') } as Express.Multer.File;
    await expect(controller.importTodos(file)).resolves.toEqual({ success: 1, failed: 2 });
    expect(dataImport.importTodos).toHaveBeenCalledWith('userId,title\n');
  });

  it('无文件时抛 BadRequest', async () => {
    await expect(controller.importUsers(undefined as never)).rejects.toThrow(BadRequestException);
    await expect(controller.importEvents(undefined as never)).rejects.toThrow(BadRequestException);
    await expect(controller.importTodos(undefined as never)).rejects.toThrow(BadRequestException);
  });

  it('三个导入端点均声明 manage-all 策略（CASL 拒绝非管理员）', () => {
    // 直接 new 实例不经过装饰器执行路径，从 Reflect metadata 取出策略处理函数并调用。
    for (const m of ['importUsers', 'importEvents', 'importTodos']) {
      // SetMetadata 把元数据存在 descriptor.value（方法函数）上，故从原型方法读取
      const handlers = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        (DataImportController.prototype as Record<string, unknown>)[m] as unknown,
      ) as Array<(ability: { can: (...args: unknown[]) => boolean }) => boolean>;
      expect(handlers?.length).toBeGreaterThan(0);
      expect(handlers[0]({ can: () => true })).toBe(true);
      expect(handlers[0]({ can: () => false })).toBe(false);
    }
  });
});
