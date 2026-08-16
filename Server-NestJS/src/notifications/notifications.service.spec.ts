import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { RealtimeService } from '../realtime/realtime.service';
import { Notification } from './notification.entity';
import { PUSH_SERVICE } from '../push/push.service';
import { PushTokenService } from '../push/push-token.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: Repository<Notification>;

  const mockNotification: Notification = {
    id: 1,
    userId: 1,
    title: 'Test',
    body: 'Body',
    type: 'system',
    targetType: null as any,
    targetId: null as any,
    isRead: false,
    link: null as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockGateway = {
    emitToUser: jest.fn(),
  };

  const mockPush = {
    sendToDevice: jest.fn().mockResolvedValue(undefined),
    sendToTopic: jest.fn().mockResolvedValue(undefined),
  };

  const mockPushTokenService = {
    getTokensForUser: jest.fn().mockResolvedValue([]),
  };

  const mockPushQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfig = {
    get: jest.fn((key: string, def?: any) =>
      key === 'QUEUE_ENABLED' ? false : def,
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: mockRepository },
        { provide: NotificationsGateway, useValue: mockGateway },
        { provide: PUSH_SERVICE, useValue: mockPush },
        { provide: PushTokenService, useValue: mockPushTokenService },
        { provide: getQueueToken('push'), useValue: mockPushQueue },
        { provide: ConfigService, useValue: mockConfig },
        { provide: RealtimeService, useValue: { emitToUser: jest.fn(), broadcast: jest.fn() } },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates notification with defaults', async () => {
      mockRepository.create.mockReturnValue(mockNotification);
      mockRepository.save.mockResolvedValue(mockNotification);

      const result = await service.create({
        userId: 1,
        title: 'Test',
        body: 'Body',
      });

      expect(result.title).toBe('Test');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, type: 'system', isRead: false }),
      );
    });

    it('pushes notification to gateway after create', async () => {
      mockRepository.create.mockReturnValue(mockNotification);
      mockRepository.save.mockResolvedValue(mockNotification);

      await service.create({ userId: 1, title: 'Test', body: 'Body' });

      expect(mockGateway.emitToUser).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ title: 'Test', id: 1 }),
      );
    });

    it('persists and forwards targetType/targetId to gateway and push', async () => {
      mockRepository.create.mockImplementation((data: any) => ({
        ...mockNotification,
        ...data,
        targetType: data.targetType,
        targetId: data.targetId,
      }));
      mockRepository.save.mockResolvedValue({
        ...mockNotification,
        targetType: 'event',
        targetId: '5',
        link: '/events/5',
      });
      mockPushTokenService.getTokensForUser.mockResolvedValue([{ token: 'reg-1' }]);

      await service.create({
        userId: 1,
        title: 'Test',
        type: 'reminder',
        targetType: 'event',
        targetId: '5',
        link: '/events/5',
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'event', targetId: '5' }),
      );
      expect(mockGateway.emitToUser).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ targetType: 'event', targetId: '5' }),
      );
      expect(mockPush.sendToDevice).toHaveBeenCalledWith(
        'reg-1',
        expect.objectContaining({
          data: expect.objectContaining({ targetType: 'event', targetId: '5' }),
        }),
      );
    });

    it('pushes to device tokens when user has registered tokens', async () => {
      mockRepository.create.mockReturnValue(mockNotification);
      mockRepository.save.mockResolvedValue({ ...mockNotification, link: '/events' });
      mockPushTokenService.getTokensForUser.mockResolvedValue([
        { token: 'reg-1' },
        { token: 'reg-2' },
      ]);

      await service.create({ userId: 1, title: 'Test', body: 'Body', link: '/events' });

      expect(mockPush.sendToDevice).toHaveBeenCalledTimes(2);
      expect(mockPush.sendToDevice).toHaveBeenCalledWith(
        'reg-1',
        expect.objectContaining({
          title: 'Test',
          body: 'Body',
          data: { type: 'system', link: '/events' },
        }),
      );
    });

    it('does not push to device when user has no tokens', async () => {
      mockRepository.create.mockReturnValue(mockNotification);
      mockRepository.save.mockResolvedValue(mockNotification);
      mockPushTokenService.getTokensForUser.mockResolvedValue([]);

      await service.create({ userId: 1, title: 'Test' });

      expect(mockPush.sendToDevice).not.toHaveBeenCalled();
    });

    it('swallows push failure (notification still created)', async () => {
      mockRepository.create.mockReturnValue(mockNotification);
      mockRepository.save.mockResolvedValue(mockNotification);
      mockPushTokenService.getTokensForUser.mockResolvedValue([{ token: 'reg-1' }]);
      mockPush.sendToDevice.mockRejectedValue(new Error('jpush down'));

      const result = await service.create({ userId: 1, title: 'Test' });

      expect(result.title).toBe('Test');
    });

    it('enqueues push job instead of sending synchronously when queue enabled', async () => {
      mockConfig.get.mockImplementation((key: string, def?: any) =>
        key === 'QUEUE_ENABLED' ? true : def,
      );
      mockRepository.create.mockReturnValue(mockNotification);
      mockRepository.save.mockResolvedValue(mockNotification);

      await service.create({ userId: 1, title: 'Test', body: 'Body', link: '/x' });

      expect(mockPushQueue.add).toHaveBeenCalledWith(
        'send',
        expect.objectContaining({ userId: 1, title: 'Test', body: 'Body' }),
        expect.objectContaining({ removeOnComplete: true }),
      );
      // 队列启用时不同步推
      expect(mockPush.sendToDevice).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns paginated notifications for user', async () => {
      mockRepository.findAndCount.mockResolvedValue([[mockNotification], 1]);

      const result = await service.findAll(1, 1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  describe('unreadCount', () => {
    it('returns unread count', async () => {
      mockRepository.count.mockResolvedValue(3);

      const count = await service.unreadCount(1);

      expect(count).toBe(3);
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { userId: 1, isRead: false },
      });
    });
  });

  describe('markRead', () => {
    it('marks own notification read', async () => {
      mockRepository.findOne.mockResolvedValue(mockNotification);
      mockRepository.update.mockResolvedValue({ affected: 1 } as any);

      await service.markRead(1, 1);

      expect(mockRepository.update).toHaveBeenCalledWith(1, { isRead: true });
    });

    it('throws ForbiddenException for other user notification', async () => {
      mockRepository.findOne.mockResolvedValue(mockNotification);

      await expect(service.markRead(1, 999)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for missing notification', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.markRead(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllRead', () => {
    it('marks all user notifications read', async () => {
      mockRepository.update.mockResolvedValue({ affected: 2 } as any);

      await service.markAllRead(1);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { userId: 1, isRead: false },
        { isRead: true },
      );
    });
  });

  describe('remove', () => {
    it('deletes own notification', async () => {
      mockRepository.findOne.mockResolvedValue(mockNotification);
      mockRepository.delete.mockResolvedValue({ affected: 1 } as any);

      await expect(service.remove(1, 1)).resolves.toBeUndefined();
      expect(mockRepository.delete).toHaveBeenCalledWith(1);
    });

    it('throws ForbiddenException for other user notification', async () => {
      mockRepository.findOne.mockResolvedValue(mockNotification);

      await expect(service.remove(1, 999)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for missing notification', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
