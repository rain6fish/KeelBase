import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

describe('AuditController', () => {
  let controller: AuditController;
  let auditService: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };

  beforeEach(() => {
    auditService = Object.fromEntries(
      ['getLogs', 'getUserLogs', 'verifyChain', 'getAllStats', 'getCostBreakdown', 'submitFeedback'].map((m) => [m, jest.fn()]),
    );
    controller = new AuditController(auditService as unknown as AuditService);
  });

  it('日志列表委托 service（无 userId 走全量）', () => {
    auditService.getLogs.mockReturnValue({ items: [], total: 0 });
    expect(controller.getLogs({ limit: 50, offset: 0 } as any)).toEqual({ items: [], total: 0 });
    expect(auditService.getLogs).toHaveBeenCalledWith({ limit: 50, offset: 0, since: undefined });

    expect(controller.getLogs({ limit: 10, offset: 5, since: '2026-08-01T00:00:00Z' } as any)).toEqual({ items: [], total: 0 });
    expect(auditService.getLogs).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 5,
      since: new Date('2026-08-01T00:00:00Z'),
    });
  });

  it('日志列表带 userId 走按用户查询', () => {
    auditService.getUserLogs.mockReturnValue({ items: [], total: 0 });
    expect(controller.getLogs({ userId: '42', limit: 20, offset: 0 } as any)).toEqual({ items: [], total: 0 });
    expect(auditService.getUserLogs).toHaveBeenCalledWith('42', { limit: 20, offset: 0, since: undefined });
  });

  it('哈希链校验委托 service', () => {
    auditService.verifyChain.mockReturnValue({ valid: true });
    expect(controller.verify()).toEqual({ valid: true });
    expect(auditService.verifyChain).toHaveBeenCalled();
  });

  it('统计/成本委托 service（since 解析）', () => {
    auditService.getAllStats.mockReturnValue({ total: 3 });
    auditService.getCostBreakdown.mockReturnValue({ rows: [] });

    expect(controller.getStats()).toEqual({ total: 3 });
    expect(auditService.getAllStats).toHaveBeenCalledWith(undefined);

    expect(controller.getStats('2026-08-01T00:00:00Z')).toEqual({ total: 3 });
    expect(auditService.getAllStats).toHaveBeenLastCalledWith(new Date('2026-08-01T00:00:00Z'));

    expect(controller.getCost()).toEqual({ rows: [] });
    expect(auditService.getCostBreakdown).toHaveBeenCalledWith(undefined);
  });

  it('提交反馈委托 service', async () => {
    auditService.submitFeedback.mockResolvedValue({ ok: true });
    await expect(
      controller.submitFeedback(mockUser as any, { conversationId: 'c1', feedback: 'thumbs_up', note: '有帮助' } as any),
    ).resolves.toEqual({ ok: true });
    expect(auditService.submitFeedback).toHaveBeenCalledWith('1', 'c1', 'thumbs_up', '有帮助');
  });
});
