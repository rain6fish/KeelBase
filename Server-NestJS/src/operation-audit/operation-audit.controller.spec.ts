import { OperationAuditController } from './operation-audit.controller';
import { OperationAuditService } from './operation-audit.service';

describe('OperationAuditController', () => {
  let controller: OperationAuditController;
  let auditService: Record<string, jest.Mock>;

  beforeEach(() => {
    auditService = Object.fromEntries(['getLogs', 'verifyChain', 'getStats'].map((m) => [m, jest.fn()]));
    controller = new OperationAuditController(auditService as unknown as OperationAuditService);
  });

  it('日志列表委托 service（参数解析）', async () => {
    auditService.getLogs.mockResolvedValue({ items: [], total: 0 });
    await expect(controller.logs(1, 20, '5', '2026-08-01T00:00:00Z')).resolves.toEqual({ items: [], total: 0 });
    expect(auditService.getLogs).toHaveBeenCalledWith(1, 20, 5, new Date('2026-08-01T00:00:00Z'));

    await controller.logs(2, 10, undefined, undefined);
    expect(auditService.getLogs).toHaveBeenLastCalledWith(2, 10, undefined, undefined);
  });

  it('哈希链校验委托 service', async () => {
    auditService.verifyChain.mockResolvedValue({ valid: true });
    await expect(controller.verify()).resolves.toEqual({ valid: true });
    expect(auditService.verifyChain).toHaveBeenCalled();
  });

  it('统计委托 service', async () => {
    auditService.getStats.mockResolvedValue({ create_event: 3 });
    await expect(controller.stats()).resolves.toEqual({ create_event: 3 });
    expect(auditService.getStats).toHaveBeenCalled();
  });
});
