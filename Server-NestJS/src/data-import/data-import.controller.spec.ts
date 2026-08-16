import { BadRequestException } from '@nestjs/common';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';

describe('DataImportController', () => {
  let controller: DataImportController;
  let dataImport: Record<string, jest.Mock>;

  beforeEach(() => {
    dataImport = { importUsers: jest.fn(), importEvents: jest.fn() };
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

  it('无文件时抛 BadRequest', async () => {
    await expect(controller.importUsers(undefined as never)).rejects.toThrow(BadRequestException);
    await expect(controller.importEvents(undefined as never)).rejects.toThrow(BadRequestException);
  });
});
