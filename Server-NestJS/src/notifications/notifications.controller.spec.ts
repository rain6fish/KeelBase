// SPDX-License-Identifier: Apache-2.0

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: Record<string, jest.Mock>;
  let gateway: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };

  beforeEach(() => {
    notificationsService = Object.fromEntries(
      ['findAll', 'unreadCount', 'markAllRead', 'markRead', 'remove'].map((m) => [m, jest.fn()]),
    );
    gateway = { subscribe: jest.fn() };
    controller = new NotificationsController(
      notificationsService as unknown as NotificationsService,
      gateway as unknown as NotificationsGateway,
    );
  });

  it('列表/未读数委托 service', async () => {
    notificationsService.findAll.mockResolvedValue({ items: [], total: 0 });
    notificationsService.unreadCount.mockResolvedValue(3);

    await expect(controller.findAll(mockUser as any, 1, 20)).resolves.toEqual({ items: [], total: 0 });
    expect(notificationsService.findAll).toHaveBeenCalledWith(1, 1, 20);

    await expect(controller.unreadCount(mockUser as any)).resolves.toEqual({ count: 3 });
  });

  it('标记已读/删除返回 null', async () => {
    notificationsService.markAllRead.mockResolvedValue(undefined);
    notificationsService.markRead.mockResolvedValue(undefined);
    notificationsService.remove.mockResolvedValue(undefined);

    await expect(controller.markAllRead(mockUser as any)).resolves.toBeNull();
    await expect(controller.markRead(7, mockUser as any)).resolves.toBeNull();
    await expect(controller.remove(8, mockUser as any)).resolves.toBeNull();

    expect(notificationsService.markAllRead).toHaveBeenCalledWith(1);
    expect(notificationsService.markRead).toHaveBeenCalledWith(7, 1);
    expect(notificationsService.remove).toHaveBeenCalledWith(8, 1);
  });

  it('SSE 流订阅 gateway', () => {
    const res = { setHeader: jest.fn(), flushHeaders: jest.fn() };
    controller.stream(mockUser as any, res as any);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.flushHeaders).toHaveBeenCalled();
    expect(gateway.subscribe).toHaveBeenCalledWith(1, res);
  });
});
