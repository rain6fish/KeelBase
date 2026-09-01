// SPDX-License-Identifier: Apache-2.0

import { SearchController } from './search.controller';
import { SearchService } from './search.service';

describe('SearchController', () => {
  let controller: SearchController;
  let searchAll: jest.Mock;

  const mockUser = { sub: 1, username: 'alex' };

  beforeEach(() => {
    searchAll = jest.fn();
    controller = new SearchController({ searchAll } as unknown as SearchService);
  });

  it('调用 searchAll 并传 q/userId/page/limit 默认值', async () => {
    const result = { events: [], users: [] };
    searchAll.mockResolvedValue(result);

    await expect(controller.search('会议', 1, 10, mockUser as any)).resolves.toBe(result);
    expect(searchAll).toHaveBeenCalledWith('会议', 1, 1, 10);
  });

  it('透传自定义 page/limit', async () => {
    const result = { events: [], users: [] };
    searchAll.mockResolvedValue(result);

    await expect(controller.search('项目', 2, 20, mockUser as any)).resolves.toBe(result);
    expect(searchAll).toHaveBeenCalledWith('项目', 1, 2, 20);
  });
});
