// SPDX-License-Identifier: Apache-2.0

import { EventsController } from './events.controller';
import { EventsService } from './events.service';

describe('EventsController', () => {
  let controller: EventsController;
  let eventsService: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };
  const ability = {} as any;

  beforeEach(() => {
    eventsService = Object.fromEntries(
      ['create', 'getEventsForRange', 'search', 'findAll', 'findOne', 'update', 'remove'].map((m) => [m, jest.fn()]),
    );
    controller = new EventsController(eventsService as unknown as EventsService);
  });

  it('创建事件委托 service', async () => {
    const dto = { title: '会议', startTime: '2026-08-01T10:00:00Z' };
    eventsService.create.mockResolvedValue({ id: 1 });
    await expect(controller.create(dto as any, mockUser as any)).resolves.toEqual({ id: 1 });
    expect(eventsService.create).toHaveBeenCalledWith(dto, 1);
  });

  it('范围查询委托 service', async () => {
    eventsService.getEventsForRange.mockResolvedValue([]);
    await expect(controller.getEvents('2026-08-01', '2026-08-31', mockUser as any)).resolves.toEqual([]);
    expect(eventsService.getEventsForRange).toHaveBeenCalledWith('2026-08-01', '2026-08-31', 1);
  });

  it('搜索委托 service（带分页默认值）', async () => {
    eventsService.search.mockResolvedValue({ items: [], total: 0 });
    await expect(controller.search('会议', '2026-08-01', '2026-08-31', 1, 20, mockUser as any)).resolves.toEqual({ items: [], total: 0 });
    expect(eventsService.search).toHaveBeenCalledWith(
      { keyword: '会议', start: '2026-08-01', end: '2026-08-31', page: 1, limit: 20 },
      1,
    );
  });

  it('管理员全量列表委托 service（含布尔/数字参数解析）', async () => {
    eventsService.findAll.mockResolvedValue({ items: [], total: 0 });
    await expect(controller.adminFindAll(1, 20, '会', '3', 'true', '2026-08-01', '2026-08-31')).resolves.toEqual({ items: [], total: 0 });
    expect(eventsService.findAll).toHaveBeenCalledWith(1, 20, {
      keyword: '会',
      userId: 3,
      isCancelled: true,
      start: '2026-08-01',
      end: '2026-08-31',
    });

    await controller.adminFindAll(1, 20, undefined, undefined, 'false', undefined, undefined);
    expect(eventsService.findAll).toHaveBeenLastCalledWith(1, 20, {
      keyword: undefined,
      userId: undefined,
      isCancelled: false,
      start: undefined,
      end: undefined,
    });
  });

  it('管理员删除委托 service 并返回 null', async () => {
    eventsService.remove.mockResolvedValue(undefined);
    await expect(controller.adminRemove(5, ability)).resolves.toBeNull();
    expect(eventsService.remove).toHaveBeenCalledWith(5, ability);
  });

  it('详情/更新/删除委托 service', async () => {
    const dto = { title: '改' };
    eventsService.findOne.mockResolvedValue({ id: 1 });
    eventsService.update.mockResolvedValue({ id: 1 });
    eventsService.remove.mockResolvedValue(undefined);

    await expect(controller.findOne(1, ability)).resolves.toEqual({ id: 1 });
    expect(eventsService.findOne).toHaveBeenCalledWith(1, ability);

    await expect(controller.update(1, dto as any, ability)).resolves.toEqual({ id: 1 });
    expect(eventsService.update).toHaveBeenCalledWith(1, dto, ability);

    await expect(controller.remove(2, ability)).resolves.toBeNull();
    expect(eventsService.remove).toHaveBeenCalledWith(2, ability);
  });
});
