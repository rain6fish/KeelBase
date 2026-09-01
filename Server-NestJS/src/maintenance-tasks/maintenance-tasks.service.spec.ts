// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserSession } from '../auth/user-session.entity';
import { PhoneVerificationCode } from '../auth/phone-verification-code.entity';
import { User, UserRole } from '../common/entities/user.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { MaintenanceTasksService } from './maintenance-tasks.service';

function mockRepo(extra: Record<string, jest.Mock> = {}) {
  return {
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue(undefined),
    ...extra,
  };
}

function mockQueryBuilder() {
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  return qb;
}

describe('MaintenanceTasksService', () => {
  let service: MaintenanceTasksService;
  let sessionsRepo: ReturnType<typeof mockRepo>;
  let phoneCodesRepo: ReturnType<typeof mockRepo>;
  let usersRepo: ReturnType<typeof mockRepo>;
  let notificationsRepo: ReturnType<typeof mockRepo>;
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    sessionsRepo = mockRepo();
    phoneCodesRepo = mockRepo();
    usersRepo = mockRepo();
    const eventsRepo = mockRepo();
    const todosRepo = mockRepo();
    notificationsRepo = mockRepo();
    notificationsService = { create: jest.fn().mockResolvedValue({ id: 1 }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MaintenanceTasksService,
        { provide: getRepositoryToken(UserSession), useValue: sessionsRepo },
        { provide: getRepositoryToken(PhoneVerificationCode), useValue: phoneCodesRepo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Event), useValue: eventsRepo },
        { provide: getRepositoryToken(Todo), useValue: todosRepo },
        { provide: getRepositoryToken(Notification), useValue: notificationsRepo },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(30) } },
      ],
    }).compile();

    service = moduleRef.get(MaintenanceTasksService);
  });

  describe('cleanupExpiredData', () => {
    it('清理过期会话/验证码/已读通知，并置空过期邮箱验证与重置 token', async () => {
      const qb = mockQueryBuilder();
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await service.cleanupExpiredData();

      expect(sessionsRepo.delete).toHaveBeenCalled();
      expect(phoneCodesRepo.delete).toHaveBeenCalled();
      expect(notificationsRepo.delete).toHaveBeenCalled();
      expect(usersRepo.createQueryBuilder).toHaveBeenCalledTimes(3);
      expect(qb.execute).toHaveBeenCalledTimes(3);
    });

    it('清理过期登录锁定', async () => {
      const qb = mockQueryBuilder();
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await service.cleanupExpiredData();

      const whereArgs = qb.where.mock.calls.map((c) => c[0]);
      expect(whereArgs).toContain(
        'locked_until IS NOT NULL AND locked_until < :now',
      );
    });

    it('已读通知保留天数来自配置', async () => {
      const qb = mockQueryBuilder();
      usersRepo.createQueryBuilder.mockReturnValue(qb);
      notificationsRepo.delete.mockResolvedValue({ affected: 0 });

      await service.cleanupExpiredData();

      const [criteria] = notificationsRepo.delete.mock.calls[0];
      expect(criteria.isRead).toBe(true);
      expect(criteria.createdAt).toBeInstanceOf(FindOperator);
    });
  });

  describe('dailyStatsSnapshot', () => {
    it('汇总各表计数并向管理员发送每日快照通知', async () => {
      usersRepo.count.mockResolvedValue(10);
      usersRepo.find.mockResolvedValue([
        { id: 1, role: UserRole.ADMIN },
        { id: 2, role: UserRole.ADMIN },
      ]);

      await service.dailyStatsSnapshot();

      expect(notificationsService.create).toHaveBeenCalledTimes(2);
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          type: 'daily_snapshot',
          title: '每日平台快照',
        }),
      );
    });

    it('无管理员时不发送通知', async () => {
      usersRepo.find.mockResolvedValue([]);

      await service.dailyStatsSnapshot();

      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });
});
