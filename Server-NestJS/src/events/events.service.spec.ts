import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { EventsService } from './events.service';
import { CacheService } from '../common/cache/cache.service';
import { Event } from './event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

/** 构造"只能管理自己事件"的能力（与 CaslAbilityFactory 规则一致） */
function makeAbility(userId: number): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  can('manage', 'Event', { userId });
  return build();
}

describe('EventsService', () => {
  let service: EventsService;
  let eventsRepository: Repository<Event>;

  const mockEvent: Event = {
    id: 1,
    title: 'Test Event',
    description: 'A test event',
    startTime: new Date('2026-08-01T09:00:00Z'),
    endTime: new Date('2026-08-01T10:00:00Z'),
    colorRole: 0 as any,
    location: 'Office',
    isCancelled: false,
    isRecurring: false,
    userId: 1,
    orgId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
    delete: jest.fn(),
    softDelete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: getRepositoryToken(Event), useValue: mockRepository },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(undefined),
            set: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
            delByPrefix: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getQueueToken('reminder'),
          useValue: {
            add: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    jest.clearAllMocks();
  });

  // ─── Create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateEventDto = {
      title: 'New Event',
      description: 'A new event',
      startTime: '2026-08-01T09:00:00Z',
      endTime: '2026-08-01T10:00:00Z',
    };

    it('should create an event linked to the user', async () => {
      mockRepository.create.mockReturnValue(mockEvent);
      mockRepository.save.mockResolvedValue(mockEvent);

      const result = await service.create(dto, 1);

      expect(result.title).toBe('Test Event');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1 }),
      );
    });

    it('schedules a reminder job when reminderMinutes set', async () => {
      const future = new Date(Date.now() + 3600 * 1000); // 1 小时后
      const withReminder = {
        ...mockEvent,
        startTime: future,
        reminderMinutes: 30,
        id: 7,
      };
      mockRepository.create.mockReturnValue(withReminder);
      mockRepository.save.mockResolvedValue(withReminder);
      const queue = (service as any).reminderQueue;

      await service.create({ ...dto, reminderMinutes: 30 }, 1);

      expect(queue.add).toHaveBeenCalledWith(
        'event-remind',
        expect.objectContaining({ eventId: 7, userId: 1 }),
        expect.objectContaining({ jobId: 'event-remind-7', delay: expect.any(Number) }),
      );
    });

    it('does not schedule reminder when reminderMinutes null', async () => {
      mockRepository.create.mockReturnValue(mockEvent);
      mockRepository.save.mockResolvedValue(mockEvent);
      const queue = (service as any).reminderQueue;

      await service.create(dto, 1);

      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  // ─── Get Events For Range ──────────────────────────────────────────────────

  describe('getEventsForRange', () => {
    it('should return events within date range for a user', async () => {
      mockRepository.find.mockResolvedValue([mockEvent]);

      const result = await service.getEventsForRange('2026-08-01', '2026-08-31', 1);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Event');
    });

    it('should return empty array when no events match', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.getEventsForRange('2026-09-01', '2026-09-30', 1);

      expect(result).toHaveLength(0);
    });

    it('ORG-3: 同组织成员事件对用户可见（查询含 orgId 条件）', async () => {
      // 注入 mock OrgService（user 5 属于 org 3）
      const mockOrgService = { getUserOrgId: jest.fn().mockResolvedValue(3) };
      (service as any).orgService = mockOrgService;
      mockRepository.find.mockResolvedValue([{ ...mockEvent, userId: 9, orgId: 3 }]);

      const result = await service.getEventsForRange('2026-08-01', '2026-08-31', 5);

      expect(result).toHaveLength(1);
      expect(mockOrgService.getUserOrgId).toHaveBeenCalledWith(5);
      // 查询条件应包含 orgId: 3
      const findWhere = mockRepository.find.mock.calls[0][0].where;
      const hasOrgCond = JSON.stringify(findWhere).includes('orgId');
      expect(hasOrgCond).toBe(true);
      // 清理，避免影响后续测试
      (service as any).orgService = undefined;
    });

    it('ORG-3: 非组织成员不注入 orgId 条件', async () => {
      const mockOrgService = { getUserOrgId: jest.fn().mockResolvedValue(null) };
      (service as any).orgService = mockOrgService;
      mockRepository.find.mockResolvedValue([mockEvent]);

      await service.getEventsForRange('2026-08-01', '2026-08-31', 5);

      const findWhere = mockRepository.find.mock.calls[0][0].where;
      expect(JSON.stringify(findWhere)).not.toContain('orgId');
      (service as any).orgService = undefined;
    });
  });

  // ─── Search ────────────────────────────────────────────────────────────────

  describe('search', () => {
    it('should return paginated search results', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockEvent]),
      };
      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.search(
        { keyword: 'Test', page: 1, limit: 20 },
        1,
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('returns cached search result on second call', async () => {
      const cache = (service as any).cacheService;
      cache.get.mockResolvedValueOnce(undefined); // first: miss
      cache.get.mockResolvedValueOnce({ items: [mockEvent], total: 1, page: 1, limit: 20, totalPages: 1 });
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockEvent]),
      };
      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.search({ keyword: 'X', page: 1, limit: 20 }, 1);
      const second = await service.search({ keyword: 'X', page: 1, limit: 20 }, 1);

      expect(second.items).toHaveLength(1);
      // 第二次命中缓存，不再查库
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('should apply date range filters', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.search(
        { keyword: '', start: '2026-08-01', end: '2026-08-31', page: 1, limit: 20 },
        1,
      );

      expect(queryBuilder.andWhere).toHaveBeenCalledTimes(2); // start and end
    });
  });

  // ─── Find One ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return event when user owns it', async () => {
      mockRepository.findOne.mockResolvedValue(mockEvent);

      const result = await service.findOne(1, makeAbility(1));

      expect(result.title).toBe('Test Event');
    });

    it('should throw NotFoundException if event does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999, makeAbility(1))).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own event', async () => {
      mockRepository.findOne.mockResolvedValue(mockEvent);

      await expect(service.findOne(1, makeAbility(999))).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── Update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    const dto: UpdateEventDto = {
      title: 'Updated Title',
    };

    it('should update own event', async () => {
      mockRepository.findOne.mockResolvedValue(mockEvent);
      mockRepository.save.mockResolvedValue({ ...mockEvent, title: 'Updated Title' });

      const result = await service.update(1, dto, makeAbility(1));

      expect(result.title).toBe('Updated Title');
    });

    it('should throw ForbiddenException when updating other user event', async () => {
      mockRepository.findOne.mockResolvedValue(mockEvent);

      await expect(service.update(1, dto, makeAbility(999))).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if event does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(999, dto, makeAbility(1))).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft-delete own event', async () => {
      mockRepository.findOne.mockResolvedValue(mockEvent);
      mockRepository.softDelete.mockResolvedValue({ affected: 1, raw: {} } as any);

      await expect(service.remove(1, makeAbility(1))).resolves.toBeUndefined();
      expect(mockRepository.softDelete).toHaveBeenCalledWith(1);
    });

    it('should throw ForbiddenException when deleting other user event', async () => {
      mockRepository.findOne.mockResolvedValue(mockEvent);

      await expect(service.remove(1, makeAbility(999))).rejects.toThrow(ForbiddenException);
    });

    it('软删受影响行数为 0 时抛 NotFound', async () => {
      mockRepository.findOne.mockResolvedValue(mockEvent);
      mockRepository.softDelete.mockResolvedValue({ affected: 0, raw: {} } as any);
      await expect(service.remove(1, makeAbility(1))).rejects.toThrow(NotFoundException);
    });

    it('移除提醒 job 失败仅记日志不阻断删除', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockEvent, reminderMinutes: 30 });
      mockRepository.softDelete.mockResolvedValue({ affected: 1, raw: {} } as any);
      (service as any).reminderQueue.remove.mockRejectedValue(new Error('job gone'));
      await expect(service.remove(1, makeAbility(1))).resolves.toBeUndefined();
    });
  });

  // ─── 补充覆盖：findAll / 范围查询边界 / 提醒失败 ───────────────────────────

  describe('findAll', () => {
    beforeEach(() => {
      (mockRepository as any).findAndCount = jest.fn().mockResolvedValue([
        [{ ...mockEvent, user: { id: 1, username: 'alex' } }],
        1,
      ]);
    });

    it('无过滤时走缓存：set 写回', async () => {
      const result = await service.findAll(1, 20);
      expect(result.items[0].user).toEqual({ id: 1, username: 'alex' });
      expect(result.totalPages).toBe(1);
      const cache = (service as any).cacheService;
      expect(cache.set).toHaveBeenCalledWith('events:list:1:20', result, expect.any(Number));
    });

    it('缓存命中时直接返回且不查库', async () => {
      const cached = { items: [{ id: 99 }], total: 1, page: 1, limit: 20, totalPages: 1 };
      (service as any).cacheService.get.mockResolvedValue(cached);
      const result = await service.findAll(1, 20);
      expect(result).toEqual(cached);
      expect(mockRepository.findAndCount).not.toHaveBeenCalled();
    });

    it('带过滤时不读写缓存', async () => {
      await service.findAll(1, 20, { keyword: '会', userId: 3, isCancelled: true, start: '2026-08-01', end: '2026-08-31' });
      const cache = (service as any).cacheService;
      expect(cache.set).not.toHaveBeenCalled();
      const where = mockRepository.findAndCount.mock.calls[0][0].where;
      expect(where.title).toBeDefined();
      expect(where.userId).toBe(3);
      expect(where.isCancelled).toBe(true);
      expect(where.startTime).toBeDefined(); // Between
    });

    it('只给 start / 只给 end 分别用 >= / <=', async () => {
      await service.findAll(1, 20, { start: '2026-08-01' });
      let where = mockRepository.findAndCount.mock.calls[0][0].where;
      expect(where.startTime._type).toBe('moreThanOrEqual');

      await service.findAll(1, 20, { end: '2026-08-31' });
      where = mockRepository.findAndCount.mock.calls[1][0].where;
      expect(where.startTime._type).toBe('lessThanOrEqual');
    });

    it('limit 钳制 1-100（CR-19）', async () => {
      await service.findAll(-5, 9999);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      );
    });
  });

  describe('范围查询与提醒边界', () => {
    it('无 userId 时只用时间范围（无所有权条件）', async () => {
      mockRepository.find.mockResolvedValue([]);
      await service.getEventsForRange('2026-08-01', '2026-08-31');
      const where = mockRepository.find.mock.calls[0][0].where;
      expect(Array.isArray(where)).toBe(true);
      // 每项都是纯时间范围，不带 orgId/userId
      expect(JSON.stringify(where)).not.toContain('userId');
    });

    it('orgService 抛错时降级为仅本人（不阻断）', async () => {
      (service as any).orgService = { getUserOrgId: jest.fn().mockRejectedValue(new Error('db down')) };
      mockRepository.find.mockResolvedValue([mockEvent]);
      const result = await service.getEventsForRange('2026-08-01', '2026-08-31', 5);
      expect(result).toHaveLength(1);
      const where = mockRepository.find.mock.calls[0][0].where;
      expect(JSON.stringify(where)).not.toContain('orgId');
      (service as any).orgService = undefined;
    });

    it('提醒 job 入队失败仅记日志（create 不阻断）', async () => {
      const future = new Date(Date.now() + 3600 * 1000).toISOString();
      const withReminder = { ...mockEvent, id: 8, startTime: new Date(future), reminderMinutes: 30 };
      mockRepository.create.mockReturnValue(withReminder);
      mockRepository.save.mockResolvedValue(withReminder);
      (service as any).reminderQueue.add.mockRejectedValue(new Error('queue down'));
      await expect(service.create({ title: 'T', startTime: future, endTime: future } as any, 1)).resolves.toBeDefined();
    });
  });
});
