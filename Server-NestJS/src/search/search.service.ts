// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Like } from 'typeorm';
import { EventsService } from '../events/events.service';
import { UsersService } from '../users/users.service';
import { readApplicationManifest } from '../common/provenance/application-manifest';
import { paginated, type Paginated } from '../common/dto/paginated';
import { resolveSearchableTargets } from './searchable-entities';

/**
 * Per-module bucket of the global search response: the module's name plus one page of its rows.
 *
 * The page itself is the shared `paginated()` shape rather than a bespoke `{ items, total }` — a
 * module bucket really is a paged list (it takes `page`/`limit` and counts everything in scope), which
 * is exactly the case that helper exists for. `module` is what makes the bucket attributable.
 *
 * 全局搜索响应里每个模块一个桶：模块名 + 它的一页记录。
 *
 * 这一页用的是共用的 `paginated()` 形状，而不是另造一个 `{ items, total }` —— 模块桶确实就是一个分页
 * 列表（它收 `page`/`limit`，并统计范围内全部命中），正是那个助手存在的场合。`module` 是让这个桶能
 * 被指认的字段。
 */
export type ModuleSearchBucket = Paginated<Record<string, unknown>> & { module: string };

/**
 * Global search: one query, aggregated over the caller's own events, the public fields of matching
 * users, and every generated module whose spec declared `searchable`.
 *
 * The third half is driven by `.keelbase/manifest.json` — not by a list kept here — so it needs no
 * edit when a module is added or removed. See `searchable-entities.ts` for what qualifies, and for
 * why an entity without an ownership column is skipped rather than searched.
 *
 * 全局搜索：一次查询，聚合调用方本人的事件、匹配用户的公开字段、以及**每个 spec 声明了
 * `searchable` 的生成模块**。
 *
 * 第三半由 `.keelbase/manifest.json` 驱动 —— 不是靠这里维护一份清单 —— 故增删模块时它无需改动。
 * 什么才算够格、以及为何没有归属列的实体是跳过而非照搜，见 `searchable-entities.ts`。
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly eventsService: EventsService,
    private readonly usersService: UsersService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * 并行搜索 events（本人，userId 隔离）、users（公开字段）与清单里的可搜索生成模块（本人）。
   */
  async searchAll(
    q: string,
    userId: number,
    page = 1,
    limit = 10,
  ): Promise<{
    events: Paginated<any>;
    users: Paginated<any>;
    modules: ModuleSearchBucket[];
  }> {
    // Clamped once, here, before anything divides by `limit`: `paginated()` computes `totalPages` as
    // `total / limit`, so a `limit=0` from a query parameter would turn into `NaN` → `null` on the
    // wire. Clamping at the single entry point keeps every bucket — and the empty-keyword answer
    // below — on the same numbers.
    // 在除法之前、只在这里钳一次：`paginated()` 的 `totalPages` 是 `total / limit`，故查询参数里的
    // `limit=0` 会变成 `NaN`、上线后成 `null`。在唯一入口钳住，能让每个桶 —— 以及下面空关键词的
    // 回答 —— 用同一组数字。
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const keyword = q.trim();
    if (!keyword) {
      return {
        events: paginated([], 0, safePage, safeLimit),
        users: paginated([], 0, safePage, safeLimit),
        modules: [],
      };
    }

    const [events, users, modules] = await Promise.all([
      this.eventsService.search({ keyword, page: safePage, limit: safeLimit }, userId),
      this.usersService.searchUsers(keyword, safePage, safeLimit),
      this.searchModules(keyword, userId, safePage, safeLimit),
    ]);

    // All three buckets go through the same shape helper: a response whose parts disagree about what
    // a page looks like is how the three-way drift this helper exists to stop gets started again.
    // 三个桶都过同一个形状助手：一份响应里各部分对「一页长什么样」各说各话，正是这个助手要拦下的
    // 那种三分叉重新开张的方式。
    return {
      events: paginated(events.items, events.total, events.page, events.limit),
      users: paginated(users.items, users.total, users.page, users.limit),
      modules,
    };
  }

  /** The modules whose spec declared `searchable`, per the Build-side manifest. */
  /* 按 Build 侧清单，spec 声明了 `searchable` 的那些模块。 */
  private searchableModules(): string[] {
    const { manifest } = readApplicationManifest();
    const declared = manifest?.searchableModules;
    return Array.isArray(declared) ? declared.filter((m): m is string => typeof m === 'string') : [];
  }

  /**
   * Query every searchable module the running process can actually reach, in parallel.
   *
   * Each module gets its own bucket, so a caller can tell "nothing matched here" from "this build
   * has no such module" — merging the modules into one list would make both look like an empty
   * result.
   *
   * 并行查询运行进程真正够得到的每个可搜索模块。`page`/`limit` 已由 `searchAll` 钳过 —— 钳制只发生
   * 在那一处。
   *
   * 每个模块各得一个桶，这样调用方能分清「这里没有命中」与「这次构建里没有该模块」—— 把模块合并成
   * 一个列表会让两者看起来都是空结果。
   */
  private async searchModules(
    keyword: string,
    userId: number,
    page: number,
    limit: number,
  ): Promise<ModuleSearchBucket[]> {
    const modules = this.searchableModules();
    if (modules.length === 0) return [];

    const targets = resolveSearchableTargets(this.dataSource, modules);

    return Promise.all(
      targets.map(async ({ module, entity, ownerColumn, textColumns, orderColumn }) => {
        const repository = this.dataSource.getRepository(entity.target);
        const pattern = `%${keyword}%`;
        // One OR-arm per text column, each arm carrying the ownership condition — so a hit on any
        // column still cannot escape the caller's scope.
        // 每个文本列一条 OR 分支，每条分支各自带上归属条件 —— 任何一列命中都逃不出调用方的范围。
        const where = textColumns.map((column) => ({
          [column]: Like(pattern),
          [ownerColumn]: userId,
        }));

        const [items, total] = await Promise.all([
          repository.find({
            where,
            order: { [orderColumn]: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
          }),
          repository.count({ where }),
        ]);

        return { module, ...paginated(items as Record<string, unknown>[], total, page, limit) };
      }),
    );
  }
}
