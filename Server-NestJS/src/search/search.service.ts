// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { UsersService } from '../users/users.service';

/**
 * 全局搜索：一次查询聚合本人事件 + 匹配用户（公开信息）。
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly eventsService: EventsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * 并行搜索 events（本人，userId 隔离）与 users（公开字段）。
   */
  async searchAll(
    q: string,
    userId: number,
    page = 1,
    limit = 10,
  ): Promise<{
    events: { items: any[]; total: number; page: number; limit: number };
    users: { items: any[]; total: number; page: number; limit: number };
  }> {
    const keyword = q.trim();
    if (!keyword) {
      return { events: { items: [], total: 0, page, limit }, users: { items: [], total: 0, page, limit } };
    }

    const [events, users] = await Promise.all([
      this.eventsService.search({ keyword, page, limit }, userId),
      this.usersService.searchUsers(keyword, page, limit),
    ]);

    return { events, users };
  }
}
