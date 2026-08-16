import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { EventsService } from '../events/events.service';
import { TodosService } from '../todos/todos.service';
import { DataImportService } from './data-import.service';

describe('DataImportService（POV-2）', () => {
  let service: DataImportService;
  let usersService: { create: jest.Mock };
  let eventsService: { create: jest.Mock };
  let todosService: { create: jest.Mock };

  beforeEach(async () => {
    usersService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    eventsService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    todosService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DataImportService,
        { provide: UsersService, useValue: usersService },
        { provide: EventsService, useValue: eventsService },
        { provide: TodosService, useValue: todosService },
      ],
    }).compile();
    service = moduleRef.get(DataImportService);
  });

  describe('parseCsv', () => {
    it('解析表头 + 数据行，忽略空行', () => {
      const rows = service.parseCsv('username,email\n\n a@x.com\n\n');
      expect(rows).toEqual([['username', 'email'], ['a@x.com']]);
    });

    it('支持带引号字段（含逗号）', () => {
      const rows = service.parseCsv('name,desc\n"Smith, John","hello, world"');
      expect(rows[1]).toEqual(['Smith, John', 'hello, world']);
    });
  });

  describe('importUsers', () => {
    it('逐行导入并统计成功/失败', async () => {
      usersService.create
        .mockResolvedValueOnce({ id: 1 })
        .mockRejectedValueOnce(new Error('用户名已存在'));

      const result = await service.importUsers('username,email,password\n\n alice,a@x.com,Pass123\nbob,b@x.com,Pass123');

      expect(result.total).toBe(2);
      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0].reason).toContain('导入失败');
      expect(usersService.create).toHaveBeenCalledTimes(2);
    });

    it('空 CSV 抛错', async () => {
      await expect(service.importUsers('')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('importEvents', () => {
    it('导入事件并带 userId', async () => {
      const result = await service.importEvents('userId,title,startTime,endTime\n\n5,会议,2026-08-01T09:00:00Z,2026-08-01T10:00:00Z');

      expect(result.success).toBe(1);
      const [dto, userId] = eventsService.create.mock.calls[0];
      expect(userId).toBe(5);
      expect(dto.title).toBe('会议');
    });

    it('userId 无效记失败', async () => {
      const result = await service.importEvents('userId,title\n\nabc,x');
      expect(result.failed).toBe(1);
      expect(result.errors[0].reason).toContain('导入失败');
    });
  });

  describe('importTodos（POV-2 深化）', () => {
    it('导入待办并带 userId / completed / dueDate', async () => {
      const result = await service.importTodos('userId,title,completed,dueDate\n\n5,买牛奶,true,2026-08-10T18:00:00Z');

      expect(result.success).toBe(1);
      const [dto, userId] = todosService.create.mock.calls[0];
      expect(userId).toBe(5);
      expect(dto.title).toBe('买牛奶');
      expect(dto.completed).toBe(true);
      expect(dto.dueDate).toContain('2026-08-10');
    });

    it('userId 无效记失败（不透传错误）', async () => {
      const result = await service.importTodos('userId,title\n\nabc,x');
      expect(result.failed).toBe(1);
      expect(result.errors[0].reason).toContain('导入失败');
    });
  });
});
