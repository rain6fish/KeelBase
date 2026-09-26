// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Like } from 'typeorm';
import { EventsService } from '../events/events.service';
import { UsersService } from '../users/users.service';
import { readApplicationManifest } from '../common/provenance/application-manifest';
import { paginated, type Paginated } from '../common/dto/paginated';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import type { FeatureKey } from '../feature-flags/feature-flags.constants';
import { resolveSearchableTargets, type SearchableDeclaration } from './searchable-entities';

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
 * edit when a module is added or removed, and the columns it may match are **declared** there
 * (written by the generator from the spec) rather than guessed from the entity at runtime. See
 * `searchable-entities.ts` for what qualifies and why, and for what a module with neither an
 * ownership column nor a surviving declared column costs: nothing — it is skipped.
 *
 * 全局搜索：一次查询，聚合调用方本人的事件、匹配用户的公开字段、以及**每个 spec 声明了
 * `searchable` 的生成模块**。
 *
 * 第三半由 `.keelbase/manifest.json` 驱动 —— 不是靠这里维护一份清单 —— 故增删模块时它无需改动；
 * 它可匹配的列也是**在那儿声明**的（生成器按 spec 写入），而不是运行时从实体上猜。什么才算够格、
 * 为什么，以及一个既无归属列、也没有任何存活声明列的模块要付什么代价 —— 不付，它被跳过，见
 * `searchable-entities.ts`。
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly eventsService: EventsService,
    private readonly usersService: UsersService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly featureFlags: FeatureFlagsService,
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

  /**
   * The declarations the manifest carries: which modules are searchable, and which of their columns.
   *
   * A module whose feature flag is off is dropped here. Its own endpoints already 404 in that state
   * (`FeatureDisabledGuard`), so returning its rows from `GET /search` would let a switched-off
   * module slink back in through the one door that does not check — and `/app/provenance` sets the
   * precedent by filtering its module list the same way. Anything but an explicit `false` counts as
   * enabled, matching how the rest of the platform reads these keys.
   *
   * 清单带的那些声明：哪些模块可搜、以及它们的哪些列。
   *
   * feature flag 关掉的模块在这里被丢掉。它自己的端点在那种状态下已经 404（`FeatureDisabledGuard`），
   * 所以让它的行从 `GET /search` 里返回，等于给一个已关掉的模块留了一扇不查开关的门 —— 而
   * `/app/provenance` 早就以同样的方式过滤其模块清单，先例在此。除显式 `false` 外都算开着，与平台
   * 其余地方读这些键的方式一致。
   */
  private searchableDeclarations(): SearchableDeclaration[] {
    const { manifest } = readApplicationManifest();
    const declared = manifest?.searchableModules;
    if (!Array.isArray(declared)) return [];

    const declarations: SearchableDeclaration[] = [];
    for (const entry of declared) {
      if (!entry || typeof entry !== 'object') continue;
      const { module, fields } = entry as { module?: unknown; fields?: unknown };
      if (typeof module !== 'string' || !Array.isArray(fields)) continue;

      const columns = fields.filter((f): f is string => typeof f === 'string');
      // Nothing declared to match, or the module is switched off — either way it does not enter.
      // 没有声明任何列可匹配，或该模块被开关关掉 —— 两种情况都不进搜索。
      if (columns.length === 0) continue;
      if (this.featureFlags.isEnabled(module as FeatureKey) === false) continue;

      declarations.push({ module, fields: columns });
    }
    return declarations;
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
    const declarations = this.searchableDeclarations();
    if (declarations.length === 0) return [];

    const targets = resolveSearchableTargets(this.dataSource, declarations);

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
