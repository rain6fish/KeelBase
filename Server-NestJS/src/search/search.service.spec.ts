// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { EventsService } from '../events/events.service';
import { UsersService } from '../users/users.service';

describe('SearchService', () => {
  let service: SearchService;
  const eventsService = { search: jest.fn() };
  const usersService = { searchUsers: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: EventsService, useValue: eventsService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('aggregates own events and public users', async () => {
    eventsService.search.mockResolvedValue({
      items: [{ id: 1, title: 'Meeting' }],
      total: 1,
      page: 1,
      limit: 10,
    });
    usersService.searchUsers.mockResolvedValue({
      items: [{ id: 9, username: 'alex', nickname: 'Alex' }],
      total: 1,
      page: 1,
      limit: 10,
    });

    const result = await service.searchAll('meet', 5, 1, 10);

    // events 查询带 userId 隔离
    expect(eventsService.search).toHaveBeenCalledWith({ keyword: 'meet', page: 1, limit: 10 }, 5);
    expect(usersService.searchUsers).toHaveBeenCalledWith('meet', 1, 10);
    expect(result.events.items).toHaveLength(1);
    expect(result.users.items).toHaveLength(1);
  });

  it('returns empty result for blank query without hitting services', async () => {
    const result = await service.searchAll('   ', 5, 1, 10);

    expect(eventsService.search).not.toHaveBeenCalled();
    expect(usersService.searchUsers).not.toHaveBeenCalled();
    expect(result.events.items).toEqual([]);
    expect(result.users.items).toEqual([]);
  });
});
