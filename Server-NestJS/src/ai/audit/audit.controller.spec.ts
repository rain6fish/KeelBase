// SPDX-License-Identifier: Apache-2.0

import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditStatsService } from './audit-stats.service';
import { AuditQueryService } from './audit-query.service';
import { AuditEvidenceService } from './audit-evidence.service';
import { CHECK_POLICIES_KEY } from '../../common/casl/check-policies.decorator';

describe('AuditController', () => {
  let controller: AuditController;
  let auditStats: Record<string, jest.Mock>;
  let auditQuery: Record<string, jest.Mock>;
  let auditEvidence: Record<string, jest.Mock>;
  let auditService: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };

  beforeEach(() => {
    // 证据/报表域已拆到 AuditEvidenceService（阶段 3 第三刀）
    auditEvidence = Object.fromEntries(
      ['verifyChain', 'getActionReport', 'getActionReportExport', 'getChain', 'getInterpretation'].map((m) => [m, jest.fn()]),
    );
    auditService = Object.fromEntries([].map((m: string) => [m, jest.fn()]));
    // 查询域已拆到 AuditQueryService（阶段 3 第二刀）
    auditQuery = Object.fromEntries(
      ['getLogs', 'getUserLogs', 'submitFeedback'].map((m) => [m, jest.fn()]),
    );
    // 聚合统计已拆到 AuditStatsService（阶段 3）——controller 现在分别委托两个服务
    auditStats = Object.fromEntries(['getStats', 'getAllStats', 'getCostBreakdown'].map((m) => [m, jest.fn()]));
    controller = new AuditController(
      auditService as unknown as AuditService,
      auditStats as unknown as AuditStatsService,
      auditQuery as unknown as AuditQueryService,
      auditEvidence as unknown as AuditEvidenceService,
    );
  });

  it('日志列表委托 service（无 userId 走全量）', () => {
    auditQuery.getLogs.mockReturnValue({ items: [], total: 0 });
    expect(controller.getLogs({ limit: 50, offset: 0 } as any)).toEqual({ items: [], total: 0 });
    expect(auditQuery.getLogs).toHaveBeenCalledWith({ limit: 50, offset: 0, since: undefined });

    expect(controller.getLogs({ limit: 10, offset: 5, since: '2026-08-01T00:00:00Z' } as any)).toEqual({ items: [], total: 0 });
    expect(auditQuery.getLogs).toHaveBeenLastCalledWith({
      limit: 10,
      offset: 5,
      since: new Date('2026-08-01T00:00:00Z'),
    });
  });

  it('日志列表带 userId 走按用户查询', () => {
    auditQuery.getUserLogs.mockReturnValue({ items: [], total: 0 });
    expect(controller.getLogs({ userId: '42', limit: 20, offset: 0 } as any)).toEqual({ items: [], total: 0 });
    expect(auditQuery.getUserLogs).toHaveBeenCalledWith('42', { limit: 20, offset: 0, since: undefined });
  });

  it('日志列表 denied 过滤透传 service（A-8 越权专门视图）', () => {
    auditQuery.getLogs.mockReturnValue({ items: [], total: 0 });
    expect(controller.getLogs({ limit: 50, offset: 0, denied: 'true' } as any)).toEqual({ items: [], total: 0 });
    expect(auditQuery.getLogs).toHaveBeenLastCalledWith({
      limit: 50,
      offset: 0,
      since: undefined,
      orgId: undefined,
      agentId: undefined,
      isError: undefined,
      denied: 'true',
    });
  });

  it('哈希链校验委托 service', () => {
    auditEvidence.verifyChain.mockReturnValue({ valid: true });
    expect(controller.verify()).toEqual({ valid: true });
    expect(auditEvidence.verifyChain).toHaveBeenCalled();
  });

  it('统计/成本委托 service（since 解析）', () => {
    auditStats.getAllStats.mockReturnValue({ total: 3 });
    auditStats.getCostBreakdown.mockReturnValue({ rows: [] });

    expect(controller.getStats()).toEqual({ total: 3 });
    expect(auditStats.getAllStats).toHaveBeenCalledWith(undefined);

    expect(controller.getStats('2026-08-01T00:00:00Z')).toEqual({ total: 3 });
    expect(auditStats.getAllStats).toHaveBeenLastCalledWith(new Date('2026-08-01T00:00:00Z'));

    expect(controller.getCost()).toEqual({ rows: [] });
    expect(auditStats.getCostBreakdown).toHaveBeenCalledWith(undefined);
  });

  it('提交反馈委托 service', async () => {
    auditQuery.submitFeedback.mockResolvedValue({ ok: true });
    await expect(
      controller.submitFeedback(mockUser as any, { conversationId: 'c1', feedback: 'thumbs_up', note: '有帮助' } as any),
    ).resolves.toEqual({ ok: true });
    expect(auditQuery.submitFeedback).toHaveBeenCalledWith('1', 'c1', 'thumbs_up', '有帮助');
  });

  it('Action Report 委托 service（userId/since/limit 解析）', () => {
    auditEvidence.getActionReport.mockReturnValue({ summary: {}, byDay: [], samples: [] });

    expect(controller.getActionReport('42', '2026-08-01', '20')).toEqual({ summary: {}, byDay: [], samples: [] });
    expect(auditEvidence.getActionReport).toHaveBeenCalledWith({
      userId: '42',
      since: expect.any(Date),
      limit: 20,
    });
  });

  it('Action Report 缺省参数 → userId/since undefined、limit 默认 10', () => {
    auditEvidence.getActionReport.mockReturnValue({});

    controller.getActionReport();

    expect(auditEvidence.getActionReport).toHaveBeenCalledWith({ userId: undefined, since: undefined, limit: 10 });
  });

  it('所有管理端点均声明 manage-all 策略（CASL 拒绝非管理员）', () => {
    // 直接 new 实例不经过装饰器执行路径，从 Reflect metadata 取出策略处理器并调用
    const methods = ['getLogs', 'verify', 'getStats', 'getCost', 'getActionReport'];
    for (const m of methods) {
      const handlers = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        (AuditController.prototype as Record<string, unknown>)[m] as unknown,
      ) as Array<(ability: { can: (...args: unknown[]) => boolean }) => boolean>;
      expect(handlers?.length).toBeGreaterThan(0);
      expect(handlers[0]({ can: () => true })).toBe(true);
      expect(handlers[0]({ can: () => false })).toBe(false);
    }
  });
});
