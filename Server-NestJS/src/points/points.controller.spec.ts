// SPDX-License-Identifier: Apache-2.0

import { PointsController } from './points.controller';
import { PointsService } from './points.service';

describe('PointsController', () => {
  let controller: PointsController;
  let pointsService: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };

  beforeEach(() => {
    pointsService = Object.fromEntries(
      ['getMyOverview', 'checkIn', 'getLeaderboard', 'getAchievements'].map((m) => [m, jest.fn()]),
    );
    controller = new PointsController(pointsService as unknown as PointsService);
  });

  it('概览/签到/成就委托 service', () => {
    pointsService.getMyOverview.mockReturnValue({ balance: 100, checkedInToday: false });
    pointsService.checkIn.mockReturnValue({ gained: 5, balance: 105, streak: 1 });
    pointsService.getAchievements.mockReturnValue([]);

    expect(controller.getMyOverview(mockUser as any)).toEqual({ balance: 100, checkedInToday: false });
    expect(controller.checkIn(mockUser as any)).toEqual({ gained: 5, balance: 105, streak: 1 });
    expect(controller.getAchievements(mockUser as any)).toEqual([]);

    expect(pointsService.getMyOverview).toHaveBeenCalledWith(1);
    expect(pointsService.checkIn).toHaveBeenCalledWith(1);
    expect(pointsService.getAchievements).toHaveBeenCalledWith(1);
  });

  it('排行榜委托 service（默认 limit 20）', () => {
    pointsService.getLeaderboard.mockReturnValue([]);
    expect(controller.getLeaderboard(20)).toEqual([]);
    expect(controller.getLeaderboard(10)).toEqual([]);
    expect(pointsService.getLeaderboard).toHaveBeenCalledWith(20);
    expect(pointsService.getLeaderboard).toHaveBeenCalledWith(10);
  });
});
