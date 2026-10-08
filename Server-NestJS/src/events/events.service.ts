// SPDX-License-Identifier: Apache-2.0

import { Injectable, NotFoundException, ForbiddenException, Optional, Logger, OnModuleInit } from '@nestjs/common';
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
import { type OrgContext } from '../common/scope/scope-policy';
import { orgContextOf, resolveScopeDescriptor } from '../common/scope/scope-resolution';
import { buildScopeWhere, rowInScope } from '../common/scope/scope-where';
import { DataScopeService } from '../authz/data-scope.service';

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
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(Event)
    private eventsRepository: Repository<Event>,
    private cacheService: CacheService,
    @Optional() @InjectQueue('reminder') private readonly reminderQueue: Queue | null,
    @Optional() private readonly orgService?: OrgService,
    @Optional() private readonly webhookPublisher?: WebhookPublisher,
    @Optional() private readonly dataScope?: DataScopeService,
  ) {}

  /**
   * REL-1：队列是**可选**依赖（`QUEUE_ENABLED` 默认 false），缺它时事件提醒**不会触发**。
   * 那是「看不见的失败」——故启动即告警一次，让它在日志里被发现，而不是等「提醒没响」被当 bug 报。
   * `/health?detail=true` 的 queue 维与 `npm run healthcheck` 同样会如实反映（见 REL-1 条目）。
   */
  onModuleInit(): void {
    if (!this.reminderQueue) {
      this.logger.warn(
        '[Reminder] 队列未启用（QUEUE_ENABLED=false，默认）→ 事件提醒不会触发；' +
          '需要提醒请部署 Redis 并设 QUEUE_ENABLED=true',
      );
    }
  }

  /** 权限-2：范围来源优先角色配置（DataScopeService），缺席回退内置默认（逐 subject 复刻旧行为） */
  private async _scopeFor(userId: number) {
    return resolveScopeDescriptor(userId, 'Event', this.orgService, this.dataScope);
  }

  async create(dto: CreateEventDto, userId: number): Promise<Event> {
    // ORG-3 + 权限-2：创建时归属用户所属组织与部门（供组织/部门数据范围过滤）
    const ctx = await this._orgContext(userId);
    const event = this.eventsRepository.create({
      ...dto,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
      userId,
      orgId: ctx?.orgId ?? undefined,
      deptId: ctx?.deptId ?? undefined,
    });
    const saved = await this.eventsRepository.save(event);
    await this.cacheService.delByPrefix('events:');
    await this._scheduleReminder(saved);
    // PL-14：事件创建事件发布（订阅 event.created 的 webhook 收到投递）
    if (this.webhookPublisher) {
      await this.webhookPublisher
        .publish('event.created', { eventId: saved.id, title: saved.title, userId, orgId: saved.orgId ?? null })
        // REL-2：原先 `() => undefined` 把 publish 自身的异常也一并吞掉（投递失败已由 WebhookService 上报，
        // 这里兜的是发布路径本身的异常）——如实记下，不让它无声消失
        .catch((err: unknown) => {
          this.logger.warn(`[Webhook] publish event.created failed: ${(err as Error).message}`);
        });
    }
    return saved;
  }

  /**
   * 调度事件提醒（delayed job，jobId 保证覆盖防重复）。
   * ⚠ 队列不可用（`QUEUE_ENABLED=false`，默认）时**直接跳过**：提醒不会触发，且**没有同步等价物**
   * ——注意这与 queue.module 自述的「降级同步执行」不同：**提醒这条路径没有降级实现**。
   * 该降级由 onModuleInit 的启动告警对外如实标注（REL-1）。
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

  async getEventsForRange(
    start: string | undefined,
    end: string | undefined,
    userId: number,
  ): Promise<Event[]> {
    this._assertCallerIdentity(userId, '范围查询');

    // 权限-2：行级数据范围（默认级别 = ORG-3 语义「本人 OR 同组织」；可按角色配置）
    const descriptor = await this._scopeFor(userId);
    const ownership: Array<Record<string, unknown>> = (buildScopeWhere<Record<string, unknown>>(
      descriptor,
      'Event',
    ) ?? []) as Array<Record<string, unknown>>;

    const where: any[] = [...ownership];
    // start/end 缺失或非法时不加时间范围（postgres 对 Invalid Date 参数报语法错，仅按所有权过滤）
    const startValid = !!start && !Number.isNaN(Date.parse(`${start}T00:00:00`));
    const endValid = !!end && !Number.isNaN(Date.parse(`${end}T23:59:59.999`));
    if (startValid && endValid) {
      // 事件与查询范围有交集 = startTime <= 范围末 且 endTime >= 范围始（区间重叠判断，
      // 覆盖完全包住查询范围的事件——仅 Between(startTime) OR Between(endTime) 会漏掉它们）
      const range = {
        startTime: LessThanOrEqual(new Date(`${end}T23:59:59.999`)),
        endTime: MoreThanOrEqual(new Date(`${start}T00:00:00`)),
      };
      for (const o of ownership) Object.assign(o, range);
      if (ownership.length === 0) where.push(range);
    }

    return this.eventsRepository.find({
      where: where.length ? where : undefined,
      order: { startTime: 'ASC' },
    });
  }

  /** ORG-3 + 权限-2：用户的组织上下文（orgId + deptId）；非成员或未注入 orgService → null */
  private async _orgContext(userId?: number): Promise<OrgContext | null> {
    return orgContextOf(this.orgService, userId);
  }

  /**
   * Fail closed when the caller identity is missing.
   *
   * A scoped read without a caller is not "unfiltered" — it is "every row", the widest possible answer to
   * a question that was never authorised. Absence must therefore deny rather than widen. The HTTP path
   * always carries `user.sub`; this guard covers what TS cannot see (plain JS, `as any`, hand-built mocks).
   *
   * 调用者身份缺席即拒。
   *
   * 带范围的读取若没有调用者，不是「未过滤」，而是「每一行」—— 对一个从未被授权的提问给出最宽的答案。
   * 故缺席必须拒绝、而不是放宽。HTTP 路径恒带 `user.sub`；此守卫兜住 TS 看不见的调用方（JS / `as any` / 手搓替身）。
   */
  private _assertCallerIdentity(userId: number, what: string): void {
    if (userId == null || Number.isNaN(Number(userId))) {
      throw new ForbiddenException(`无法确定调用者身份，拒绝${what}`);
    }
  }

  async search(params: SearchEventsParams, userId: number): Promise<PaginatedResult<Event>> {
    this._assertCallerIdentity(userId, '搜索');

    // CR-19：limit 钳制 1-100，防超大值全表拉取 + 缓存键膨胀
    params.page = Math.max(1, params.page);
    params.limit = Math.min(Math.max(params.limit, 1), 100);
    const key = `events:search:${userId}:${params.keyword ?? ''}:${params.page}:${params.limit}:${params.start ?? ''}:${params.end ?? ''}`;
    const cached = await this.cacheService.get(key);
    if (cached) return cached as any;

    // 权限-2 / 强制点矩阵 §10 ① 行：与 `GET /events` 走**同一行级谓词**（`buildScopeWhere`）。
    // 此前这里自己写 `event.userId = :userId`，于是搜索比列表更窄——列表含同组织，搜索只含本人。
    //
    // Permission-2 / enforcement-point matrix §10 row ①: the same row-level predicate as `GET /events`
    // (`buildScopeWhere`). This used to hand-roll `event.userId = :userId`, so search was narrower than
    // the list — the list includes same-org rows, search only the caller's own.
    const descriptor = await this._scopeFor(userId);
    const ownership: Array<Record<string, unknown>> = (buildScopeWhere<Record<string, unknown>>(
      descriptor,
      'Event',
    ) ?? []) as Array<Record<string, unknown>>;

    // A `where` array means **OR**, so every AND condition must be **distributed** onto each row-level
    // branch (the same move `getEventsForRange` makes). The keyword is itself an OR of title/description,
    // which lives as **two branches** in the array.
    // `where` 数组的语义是 **OR**，故每个 AND 条件都要**分发**到各条行级分支上（与 `getEventsForRange`
    // 同一手法）。关键词本身是 title/description 的 OR，靠**两条分支**表达。
    let branches: Array<Record<string, unknown>> = ownership.length
      ? ownership.map((o) => ({ ...o }))
      : [{}];
    if (params.keyword) {
      const kw = `%${params.keyword}%`;
      branches = branches.flatMap((b) => [
        { ...b, title: Like(kw) },
        { ...b, description: Like(kw) },
      ]);
    }
    // Invalid dates are dropped rather than passed through (postgres rejects an Invalid Date parameter);
    // same rule as `getEventsForRange`.
    // 非法日期**不加**时间范围（postgres 对 Invalid Date 参数报语法错）；与 `getEventsForRange` 同口径。
    const startAt = params.start ? new Date(`${params.start}T00:00:00`) : null;
    if (startAt && !Number.isNaN(startAt.getTime())) {
      for (const b of branches) b.startTime = MoreThanOrEqual(startAt);
    }
    const endAt = params.end ? new Date(`${params.end}T23:59:59.999`) : null;
    if (endAt && !Number.isNaN(endAt.getTime())) {
      for (const b of branches) b.endTime = LessThanOrEqual(endAt);
    }

    const [items, total] = await this.eventsRepository.findAndCount({
      where: branches as any,
      order: { startTime: 'DESC' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });

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

  async findOne(id: number, ability: AppAbility, userId: number): Promise<Event> {
    this._assertCallerIdentity(userId, '读取事件');
    const event = await this.eventsRepository.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (!(await this._canAccess(event, ability, userId))) {
      throw new ForbiddenException('无权访问此事件');
    }
    return event;
  }

  /**
   * ORG-3 unified access control: the owner (CASL ownership) **or** a member of the same organisation may
   * read/manage it, so the detail path agrees with the list (own OR same org) and the half-isolation of
   * "visible in the list, 403 by id" is gone.
   *
   * The caller's identity is required, as it is in `ReportsService._canAccess`; absence is a deny handled
   * by `_assertCallerIdentity` before this is reached, not a silent fall back to CASL alone.
   *
   * ORG-3 统一访问控制：本人（CASL 所有权）**或**同组织成员可读/管理，使明细与列表（本人 OR 同组织）
   * 一致，消除「列表可见但明细 403」的半套隔离。
   *
   * 调用者身份必填，与 `ReportsService._canAccess` 同口径；缺席由 `_assertCallerIdentity` 在进入本方法
   * 前拒绝，而不是静默退回仅 CASL。
   */
  private async _canAccess(event: Event, ability: AppAbility, userId: number): Promise<boolean> {
    if (ability.can('read', subject('Event', event))) return true;
    // 权限-2：范围扩展与列表 where 同源（`buildScopeWhere` / `rowInScope` 同一构造器）
    const descriptor = await this._scopeFor(userId);
    return rowInScope(event as unknown as Record<string, unknown>, descriptor, 'Event');
  }

  async update(
    id: number,
    dto: UpdateEventDto,
    ability: AppAbility,
    userId: number,
  ): Promise<Event> {
    const event = await this.findOne(id, ability, userId);
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

  async remove(id: number, ability: AppAbility, userId: number): Promise<void> {
    const event = await this.findOne(id, ability, userId);
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
