// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { DataSource, Like } from 'typeorm';
import { EventsService } from '../events/events.service';
import { UsersService } from '../users/users.service';
import { MODULES_MANIFEST } from '../common/modules/modules-manifest';
import { paginated, type Paginated } from '../common/dto/paginated';

/**
 * 全局搜索：一次查询聚合**本人事件** + **匹配用户**（公开信息）+ **声明了 `search` 的生成模块**（P0-9a）。
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly eventsService: EventsService,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 并行搜索 events（本人，userId 隔离）· users（公开字段）· 生成模块（见 `_searchGeneratedModules`）。
   *
   * `modules` 是**按模块 id 分组**的桶（每桶与 events/users 同形状）—— 不摊平成一个数组：不同模块的
   * 字段各不相同，摊平后消费方分不清「这条来自哪个模块的什么字段」。
   */
  async searchAll(
    q: string,
    userId: number,
    page = 1,
    limit = 10,
  ): Promise<{
    events: { items: any[]; total: number; page: number; limit: number };
    users: { items: any[]; total: number; page: number; limit: number };
    modules: Record<string, Paginated<unknown>>;
  }> {
    const keyword = q.trim();
    if (!keyword) {
      // 空关键词的两种分支同形状（`paginated()` 是分页响应的唯一定义，含 `totalPages`）
      return { events: paginated([], 0, page, limit), users: paginated([], 0, page, limit), modules: {} };
    }

    const [events, users, modules] = await Promise.all([
      this.eventsService.search({ keyword, page, limit }, userId),
      this.usersService.searchUsers(keyword, page, limit),
      this._searchGeneratedModules(keyword, userId, page, limit),
    ]);

    return { events, users, modules };
  }

  /**
   * P0-9a：查**清单里声明了 `search` 的模块**（生成物）。
   *
   * 按实体名从 DataSource 取仓 —— 生成物的实体已由各自 module 注册进 TypeORM，故平台侧无需逐个
   * import 生成物；新增可搜模块只改 `MODULES_MANIFEST`（由生成器按 spec 的 `searchable` 接线写入），
   * 本文件不动。
   *
   * **范围只按 owner（`userId`）**：与生成物今天的固定安全接线同口径 —— 在声明组织/部门范围之前
   * **不静默放宽**（与 `SCOPE_COLUMNS` 的缺省一致）。软删行由 TypeORM 默认排除。
   */
  private async _searchGeneratedModules(
    keyword: string,
    userId: number,
    page: number,
    limit: number,
  ): Promise<Record<string, Paginated<unknown>>> {
    // 与各 list 端点同口径的钳制：`limit < 1` 会让 `paginated()` 的 totalPages 变 Infinity（JSON 里成 null）
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const out: Record<string, Paginated<unknown>> = {};

    for (const entry of MODULES_MANIFEST) {
      const spec = entry.search;
      // 未声明、或声明了却没有可搜字段 ⇒ 不进索引（**绝不放宽成「搜全部列」**）
      if (!spec || spec.fields.length === 0) continue;
      // 该模块被特性开关关掉时实体不在 DataSource 里 —— 跳过，不让一个模块拖垮整体搜索
      if (!this.dataSource.hasMetadata(spec.entity)) continue;

      const where = spec.fields.map((field) => ({ [field]: Like(`%${keyword}%`), userId }));
      const [items, total] = await this.dataSource.getRepository(spec.entity).findAndCount({
        where,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      });
      out[entry.id] = paginated(items, total, safePage, safeLimit);
    }

    return out;
  }
}
