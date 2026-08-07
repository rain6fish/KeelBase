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
    it('should delete own event', async () => {
      mockRepository.findOne.mockResolvedValue(mockEvent);
      mockRepository.delete.mockResolvedValue({ affected: 1, raw: {} } as any);

      await expect(service.remove(1, makeAbility(1))).resolves.toBeUndefined();
    });

    it('should throw ForbiddenException when deleting other user event', async () => {
      mockRepository.findOne.mockResolvedValue(mockEvent);

      await expect(service.remove(1, makeAbility(999))).rejects.toThrow(ForbiddenException);
    });
  });
});
