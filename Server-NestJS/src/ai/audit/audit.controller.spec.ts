// SPDX-License-Identifier: Apache-2.0

import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditStatsService } from './audit-stats.service';
import { AuditQueryService } from './audit-query.service';
import { AuditEvidenceService } from './audit-evidence.service';
import { CoverageService } from './coverage.service';
import { CHECK_POLICIES_KEY } from '../../common/casl/check-policies.decorator';
import { UserRole } from '../../common/entities/user.entity';

describe('AuditController', () => {
  let controller: AuditController;
  let auditStats: Record<string, jest.Mock>;
  let auditQuery: Record<string, jest.Mock>;
  let auditEvidence: Record<string, jest.Mock>;
  let auditService: Record<string, jest.Mock>;
  let coverage: Record<string, jest.Mock>;

  const mockUser = { sub: 1, username: 'alex' };
  // The list projection is role-aware: an admin keeps the full row, everyone else gets the whitelist.
  // 列表投影按角色分流：管理员保留整行，其余一切角色拿白名单。
  const admin = { ...mockUser, role: UserRole.ADMIN };
  const auditor = { ...mockUser, role: UserRole.AUDITOR };

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
    // AW-3 覆盖声明（阶段 3 之后的第五个域）：控制器只把它转出去，故这里只要有一个 forScope
    // AW-3 coverage statement (fifth domain): the controller only delegates, so a `forScope` stub is all
    // this needs.
    coverage = Object.fromEntries(['forScope'].map((m) => [m, jest.fn()]));
    controller = new AuditController(
      auditService as unknown as AuditService,
      auditStats as unknown as AuditStatsService,
      auditQuery as unknown as AuditQueryService,
      auditEvidence as unknown as AuditEvidenceService,
      coverage as unknown as CoverageService,
    );
  });

  it('日志列表委托 service（无 userId 走全量）', async () => {
    auditQuery.getLogs.mockResolvedValue([]);
    await expect(controller.getLogs({ limit: 50, offset: 0 } as any, admin as any)).resolves.toEqual([]);
    expect(auditQuery.getLogs).toHaveBeenCalledWith(
      { limit: 50, offset: 0, since: undefined, until: undefined },
      { userId: 1, role: UserRole.ADMIN },
    );

    await expect(
      controller.getLogs({ limit: 10, offset: 5, since: '2026-08-01T00:00:00Z' } as any, admin as any),
    ).resolves.toEqual([]);
    expect(auditQuery.getLogs).toHaveBeenLastCalledWith(
      {
        limit: 10,
        offset: 5,
        since: new Date('2026-08-01T00:00:00Z'),
        until: undefined,
      },
      { userId: 1, role: UserRole.ADMIN },
    );
  });

  it('日志列表带 userId 走按用户查询', async () => {
    auditQuery.getUserLogs.mockResolvedValue([]);
    await expect(
      controller.getLogs({ userId: '42', limit: 20, offset: 0 } as any, admin as any),
    ).resolves.toEqual([]);
    expect(auditQuery.getUserLogs).toHaveBeenCalledWith(
      '42',
      { limit: 20, offset: 0, since: undefined, until: undefined },
      { userId: 1, role: UserRole.ADMIN },
    );
  });

  it('日志列表 denied 过滤透传 service（A-8 越权专门视图）', async () => {
    auditQuery.getLogs.mockResolvedValue([]);
    await expect(
      controller.getLogs({ limit: 50, offset: 0, denied: 'true' } as any, admin as any),
    ).resolves.toEqual([]);
    expect(auditQuery.getLogs).toHaveBeenLastCalledWith(
      {
        limit: 50,
        offset: 0,
        since: undefined,
        until: undefined,
        orgId: undefined,
        agentId: undefined,
        isError: undefined,
        denied: 'true',
      },
      { userId: 1, role: UserRole.ADMIN },
    );
  });

  it('AW-2：审计读者拿白名单行，管理员拿整行', async () => {
    const row = {
      id: 1,
      userId: '5',
      username: 'alice',
      action: 'tool_call',
      createdAt: '2026-08-01T00:00:00.000Z',
      guestId: 'visitor-1',
      ip: '10.0.0.1',
      conversationId: 'conv-1',
    };
    auditQuery.getLogs.mockResolvedValue([row]);

    const forAuditor = await controller.getLogs({ limit: 10, offset: 0 } as any, auditor as any);
    expect(forAuditor[0]).toMatchObject({ id: 1, username: 'alice' });
    expect(forAuditor[0]).not.toHaveProperty('guestId');
    expect(forAuditor[0]).not.toHaveProperty('ip');
    expect(forAuditor[0]).not.toHaveProperty('conversationId');

    const forAdmin = await controller.getLogs({ limit: 10, offset: 0 } as any, admin as any);
    expect(forAdmin[0]).toEqual(row);
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

  it('每个读端点都声明了判据，且该判据默认拒（不再是清一色 manage-all）', () => {
    // 直接 new 实例不经过装饰器执行路径，从 Reflect metadata 取出策略处理器并调用。
    // 标题改了：自 AW-2 起本控制器的判据是 `read AuditLog` 而不是 `manage all`，因为审计读者要能进来。
    // `manage all` 蕴含 `read`，故管理员不受影响；这里钉的是「有一个**非平凡**判据、且它默认拒」。
    //
    // The title changed: since AW-2 this controller judges `read AuditLog` rather than `manage all`,
    // because an audit reader has to get in. `manage all` implies `read`, so admins are unaffected;
    // what this pins is that there IS a non-trivial handler and that it denies by default.
    const methods = ['getLogs', 'verify', 'getStats', 'getCost', 'getActionReport', 'getCoverage'];
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
