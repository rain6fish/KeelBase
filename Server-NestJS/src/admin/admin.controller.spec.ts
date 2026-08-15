import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { HeadlessKeysService } from '../headless/headless-keys.service';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: Record<string, jest.Mock>;
  let headlessKeysService: Record<string, jest.Mock>;

  beforeEach(() => {
    adminService = Object.fromEntries(
      [
        'getMonitorSummary', 'getOverview', 'getSessions', 'getUserDetail',
        'revokeSession', 'broadcast', 'getAnalytics', 'getTrash', 'restoreTrashItem',
      ].map((m) => [m, jest.fn()]),
    );
    headlessKeysService = Object.fromEntries(
      ['list', 'create', 'update', 'remove'].map((m) => [m, jest.fn()]),
    );
    controller = new AdminController(
      adminService as unknown as AdminService,
      headlessKeysService as unknown as HeadlessKeysService,
    );
  });

  it('getMonitorSummary 委托 service', () => {
    const summary = { healthy: true };
    adminService.getMonitorSummary.mockReturnValue(summary);
    expect(controller.getMonitorSummary()).toBe(summary);
  });

  it('getOverview 把 days 换算成 since 日期', () => {
    const overview = { users: 1 };
    adminService.getOverview.mockReturnValue(overview);
    const since = new Date();
    const result = controller.getOverview(7);
    expect(adminService.getOverview).toHaveBeenCalledWith(expect.any(Date));
    expect(result).toBe(overview);
    // days 被 clamp 到 [1, 90]
    controller.getOverview(999);
    expect(adminService.getOverview.mock.calls[1][0].getTime()).toBeLessThanOrEqual(since.getTime());
  });

  it('getSessions / getUserDetail 委托 service', () => {
    adminService.getSessions.mockReturnValue([]);
    adminService.getUserDetail.mockReturnValue({ user: {} });
    expect(controller.getSessions()).toEqual([]);
    expect(controller.getUserDetail(3)).toEqual({ user: {} });
    expect(adminService.getUserDetail).toHaveBeenCalledWith(3);
  });

  it('revokeSession 返回 null', async () => {
    adminService.revokeSession.mockResolvedValue(undefined);
    await expect(controller.revokeSession(2)).resolves.toBeNull();
    expect(adminService.revokeSession).toHaveBeenCalledWith(2);
  });

  it('broadcast 委托 service', () => {
    const dto = { title: '公告', audience: 'all' };
    adminService.broadcast.mockReturnValue({ sent: 10 });
    expect(controller.broadcast(dto as any)).toEqual({ sent: 10 });
    expect(adminService.broadcast).toHaveBeenCalledWith(dto);
  });

  it('getAnalytics 透传 days', () => {
    adminService.getAnalytics.mockReturnValue({ dau: 1 });
    expect(controller.getAnalytics(30)).toEqual({ dau: 1 });
    expect(adminService.getAnalytics).toHaveBeenCalledWith(30);
  });

  it('getTrash 委托并 clamp limit', () => {
    adminService.getTrash.mockReturnValue({ items: [] });
    controller.getTrash(1, 20);
    expect(adminService.getTrash).toHaveBeenCalledWith(1, 20);
    controller.getTrash(2, 500);
    expect(adminService.getTrash).toHaveBeenCalledWith(2, 100);
  });

  it('restoreTrashItem 委托 service', () => {
    adminService.restoreTrashItem.mockReturnValue({ restored: true });
    expect(controller.restoreTrash('event', 5)).toEqual({ restored: true });
    expect(adminService.restoreTrashItem).toHaveBeenCalledWith('event', 5);
  });

  it('headless key CRUD 委托 headlessKeysService', async () => {
    headlessKeysService.list.mockReturnValue([]);
    headlessKeysService.create.mockReturnValue({ id: 1, key: 'sk-...' });
    headlessKeysService.update.mockReturnValue({ id: 1 });
    headlessKeysService.remove.mockResolvedValue(undefined);

    expect(controller.listHeadlessKeys()).toEqual([]);
    expect(controller.createHeadlessKey({ name: 'x' } as any)).toEqual({ id: 1, key: 'sk-...' });
    expect(controller.updateHeadlessKey(1, { name: 'y' } as any)).toEqual({ id: 1 });
    await expect(controller.deleteHeadlessKey(1)).resolves.toEqual({ deleted: true, id: 1 });

    expect(headlessKeysService.create).toHaveBeenCalledWith({ name: 'x' });
    expect(headlessKeysService.update).toHaveBeenCalledWith(1, { name: 'y' });
    expect(headlessKeysService.remove).toHaveBeenCalledWith(1);
  });
});
