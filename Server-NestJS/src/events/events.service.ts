import { Injectable, NotFoundException, ForbiddenException, Optional, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Between, MoreThanOrEqual, LessThanOrEqual, Repository, Like } from 'typeorm';
import { subject } from '@casl/ability';
import { Event } from './event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';
import { CacheService } from '../common/cache/cache.service';
import { OrgService } from '../org/org.service';
import type { WebhookPublisher } from '../webhooks/webhook.service';

const EVENT_CACHE_TTL_MS = 60 * 1000;

export interface SearchEventsParams {
  keyword?: string;
  start?: string;
  end?: string;
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(Event)
    private eventsRepository: Repository<Event>,
    private cacheService: CacheService,
    @Optional() @InjectQueue('reminder') private readonly reminderQueue: Queue | null,
    @Optional() private readonly orgService?: OrgService,
    @Optional() private readonly webhookPublisher?: WebhookPublisher,
  ) {}

  async create(dto: CreateEventDto, userId: number): Promise<Event> {
    // ORG-3：创建时自动归属用户所属组织（同组织成员可见）
    const orgId = await this._userOrgId(userId);
    const event = this.eventsRepository.create({
      ...dto,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      userId,
      orgId: orgId ?? undefined,
    });
    const saved = await this.eventsRepository.save(event);
    await this.cacheService.delByPrefix('events:');
    await this._scheduleReminder(saved);
    // PL-14：事件创建事件发布（订阅 event.created 的 webhook 收到投递）
    if (this.webhookPublisher) {
      await this.webhookPublisher
        .publish('event.created', { eventId: saved.id, title: saved.title, userId, orgId: saved.orgId ?? null })
        .catch(() => undefined);
    }
    return saved;
  }

  /**
   * 调度事件提醒（delayed job，jobId 保证覆盖防重复）。
   * QUEUE_ENABLED=false 或队列不可用时跳过（提醒不生效，业务正常）。
   */
  private async _scheduleReminder(event: Event): Promise<void> {
    if (!this.reminderQueue) return;
    const jobId = `event-remind-${event.id}`;
    const reminderMinutes = event.reminderMinutes;
    const remindAt = reminderMinutes != null ? event.startTime.getTime() - reminderMinutes * 60000 : null;
    // 提醒不再需要（清空/取消/时间已过）→ 移除可能残留的旧 job，防过期提醒继续触发
    if (reminderMinutes == null || event.isCancelled || (remindAt != null && remindAt <= Date.now())) {
      try {
        await this.reminderQueue.remove(jobId);
      } catch (err) {
        this.logger.warn(`[Reminder] remove job failed event=${event.id}: ${(err as Error).message}`);
      }
      return;
    }
    try {
      await this.reminderQueue.add(
        'event-remind',
        { eventId: event.id, userId: event.userId },
        {
          delay: event.startTime.getTime() - reminderMinutes * 60000 - Date.now(),
          jobId,
          removeOnComplete: true,
        },
      );
    } catch (err) {
      this.logger.warn(`[Reminder] schedule failed event=${event.id}: ${(err as Error).message}`);
    }
  }

  async findAll(
    page = 1,
    limit = 20,
    filter: { keyword?: string; userId?: number; isCancelled?: boolean; start?: string; end?: string } = {},
  ): Promise<PaginatedResult<Omit<Event, 'user'> & { user?: { id: number; username: string } }>> {
    // CR-19：limit 钳制 1-100，防超大值全表拉取 + 缓存键膨胀
    page = Math.max(1, page);
    limit = Math.min(Math.max(limit, 1), 100);
    const key = `events:list:${page}:${limit}`;
    const cached = await this.cacheService.get(key);
    if (cached && !this._hasFilter(filter)) return cached as any;

    const where: Record<string, unknown> = {};
    if (filter.userId != null) where.userId = filter.userId;
    if (filter.isCancelled != null) where.isCancelled = filter.isCancelled;
    if (filter.start || filter.end) {
      if (filter.start && filter.end) {
        where.startTime = Between(new Date(filter.start), new Date(filter.end));
      } else if (filter.start) {
        where.startTime = MoreThanOrEqual(new Date(filter.start));
      } else if (filter.end) {
        where.startTime = LessThanOrEqual(new Date(filter.end));
      }
    }
    if (filter.keyword) {
      where.title = Like(`%${filter.keyword}%`);
    }

    const [items, total] = await this.eventsRepository.findAndCount({
      relations: { user: true },
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { startTime: 'DESC' },
    });
    const mapped = items.map(({ user, ...event }) => ({
      ...event,
      user: user ? { id: user.id, username: user.username } : undefined,
    }));
    const result = {
      items: mapped,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
    if (!this._hasFilter(filter)) {
      await this.cacheService.set(key, result, EVENT_CACHE_TTL_MS);
    }
    return result;
  }

  private _hasFilter(filter: { keyword?: string; userId?: number; isCancelled?: boolean; start?: string; end?: string }): boolean {
    return !!(filter.keyword || filter.userId != null || filter.isCancelled != null || filter.start || filter.end);
  }

  async getEventsForRange(start: string, end: string, userId?: number): Promise<Event[]> {
    // 扩展日期范围到全天，避免时区边界问题
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T23:59:59.999`);

    // ORG-3 数据隔离：本人事件 OR 同组织事件（orgId = 用户所属组织）
    const orgId = userId ? await this._userOrgId(userId) : null;

    // 事件与查询范围有交集 = startTime <= 范围末 且 endTime >= 范围始（区间重叠判断，
    // 覆盖完全包住查询范围的事件——仅 Between(startTime) OR Between(endTime) 会漏掉它们）
    const ownership: Array<Record<string, unknown>> = [];
    if (userId) ownership.push({ userId });
    if (orgId != null) ownership.push({ orgId });
    const range = { startTime: LessThanOrEqual(endDate), endTime: MoreThanOrEqual(startDate) };
    const where: any[] = [];
    if (ownership.length === 0) {
      where.push(range);
    } else {
      for (const o of ownership) where.push({ ...range, ...o });
    }

    return this.eventsRepository.find({
      where,
      order: { startTime: 'ASC' },
    });
  }

  /** ORG-3：取用户所属组织 id（非成员或未注入 orgService 返回 null） */
  private async _userOrgId(userId?: number): Promise<number | null> {
    if (!userId || !this.orgService) return null;
    try {
      return await this.orgService.getUserOrgId(userId);
    } catch {
      return null;
    }
  }

  async search(params: SearchEventsParams, userId?: number): Promise<PaginatedResult<Event>> {
    // CR-19：limit 钳制 1-100，防超大值全表拉取 + 缓存键膨胀
    params.page = Math.max(1, params.page);
    params.limit = Math.min(Math.max(params.limit, 1), 100);
    const key = `events:search:${userId ?? 'all'}:${params.keyword ?? ''}:${params.page}:${params.limit}:${params.start ?? ''}:${params.end ?? ''}`;
    const cached = await this.cacheService.get(key);
    if (cached) return cached as any;

    const queryBuilder = this.eventsRepository.createQueryBuilder('event');

    if (userId) {
      queryBuilder.where('event.userId = :userId', { userId });
    }

    if (params.keyword) {
      queryBuilder.andWhere(
        '(event.title LIKE :keyword OR event.description LIKE :keyword)',
        { keyword: `%${params.keyword}%` },
      );
    }

    if (params.start) {
      queryBuilder.andWhere('event.startTime >= :start', { start: new Date(`${params.start}T00:00:00`) });
    }

    if (params.end) {
      queryBuilder.andWhere('event.endTime <= :end', { end: new Date(`${params.end}T23:59:59.999`) });
    }

    const total = await queryBuilder.getCount();

    const items = await queryBuilder
      .orderBy('event.startTime', 'DESC')
      .skip((params.page - 1) * params.limit)
      .take(params.limit)
      .getMany();

    const result = {
      items,
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit),
    };
    await this.cacheService.set(key, result, EVENT_CACHE_TTL_MS);
    return result;
  }

  async findOne(id: number, ability: AppAbility): Promise<Event> {
    const event = await this.eventsRepository.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (ability.cannot('read', subject('Event', event))) {
      throw new ForbiddenException('无权访问此事件');
    }
    return event;
  }

  async update(id: number, dto: UpdateEventDto, ability: AppAbility): Promise<Event> {
    const event = await this.findOne(id, ability);
    const updateData: any = { ...dto };
    if (dto.startTime) updateData.startTime = new Date(dto.startTime);
    if (dto.endTime) updateData.endTime = new Date(dto.endTime);
    Object.assign(event, updateData);
    const saved = await this.eventsRepository.save(event);
    await this.cacheService.delByPrefix('events:');
    // 更新后重新调度（jobId 覆盖旧 job，不重复提醒）
    await this._scheduleReminder(saved);
    return saved;
  }

  async remove(id: number, ability: AppAbility): Promise<void> {
    const event = await this.findOne(id, ability);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    const result = await this.eventsRepository.softDelete(event.id);
    if (result.affected === 0) {
      throw new NotFoundException('Event not found');
    }
    await this.cacheService.delByPrefix('events:');
    // 移除待触发提醒 job
    if (this.reminderQueue && event.reminderMinutes != null) {
      try {
        await this.reminderQueue.remove(`event-remind-${event.id}`);
      } catch (err) {
        this.logger.warn(`[Reminder] remove job failed event=${event.id}: ${(err as Error).message}`);
      }
    }
  }
}
