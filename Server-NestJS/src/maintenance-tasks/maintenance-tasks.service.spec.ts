// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FindOperator } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserSession } from '../auth/user-session.entity';
import { PhoneVerificationCode } from '../auth/phone-verification-code.entity';
import { User, UserRole } from '../common/entities/user.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfirmationStore } from '../ai/confirmation/confirmation.store';
import { BehaviorBaselineService } from '../ai/behavior-baseline/behavior-baseline.service';
import { AlertWebhookService } from '../alert-webhook/alert-webhook.service';
import { AuditEvidenceService } from '../governance-shared/services/audit-evidence.service';
import { OperationAuditService } from '../operation-audit/operation-audit.service';
import { AuditService } from '../governance-shared/services/audit.service';
import { WriteClaimDecisionService } from '../governance-shared/services/write-claim-decision.service';
import { AiToolEffectsService } from '../governance-shared/services/ai-tool-effects.service';
import { MaintenanceTasksService } from './maintenance-tasks.service';

function mockRepo(extra: Record<string, jest.Mock> = {}) {
  return {
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue(undefined),
    ...extra,
  };
}

function mockQueryBuilder() {
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  return qb;
}

import { ToolResultBodyStore } from '../governance-shared/services/tool-result-body.store';

describe('MaintenanceTasksService', () => {
  let service: MaintenanceTasksService;
  let sessionsRepo: ReturnType<typeof mockRepo>;
  let phoneCodesRepo: ReturnType<typeof mockRepo>;
  let usersRepo: ReturnType<typeof mockRepo>;
  let notificationsRepo: ReturnType<typeof mockRepo>;
  let notificationsService: { create: jest.Mock };
  let confirmationStore: { offlineTtlMs: jest.Mock; expireStale: jest.Mock };
  let auditService: { log: jest.Mock };
  let writeClaimDecision: { sweepOverdue: jest.Mock };
  let toolEffects: { reconcileDueClaims: jest.Mock };

  beforeEach(async () => {
    sessionsRepo = mockRepo();
    phoneCodesRepo = mockRepo();
    usersRepo = mockRepo();
    const eventsRepo = mockRepo();
    const todosRepo = mockRepo();
    notificationsRepo = mockRepo();
    notificationsService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    confirmationStore = {
      offlineTtlMs: jest.fn().mockResolvedValue(86_400_000),
      expireStale: jest.fn().mockResolvedValue([]),
    };
    auditService = { log: jest.fn().mockResolvedValue({ id: 1 }) };
    writeClaimDecision = {
      sweepOverdue: jest.fn().mockResolvedValue({ moved: 0, thresholdMinutes: 60 }),
    };
    toolEffects = {
      reconcileDueClaims: jest.fn().mockResolvedValue({
        candidates: 0,
        asked: 0,
        converged: 0,
        unresolved: 0,
        skippedUnaskable: 0,
        skippedExhausted: 0,
        skippedNotDue: 0,
        refused: 0,
        deferredByPassCap: 0,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MaintenanceTasksService,
        { provide: getRepositoryToken(UserSession), useValue: sessionsRepo },
        { provide: getRepositoryToken(PhoneVerificationCode), useValue: phoneCodesRepo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Event), useValue: eventsRepo },
        { provide: getRepositoryToken(Todo), useValue: todosRepo },
        { provide: getRepositoryToken(Notification), useValue: notificationsRepo },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(30) } },
        // GA：离线窗口到期的确认清理要它；本文件只测其余维护任务，故给最小替身
        { provide: ConfirmationStore, useValue: confirmationStore },
        // P0-19 ⑧：到期记录写在这里
        { provide: AuditService, useValue: auditService },
        // BA 异常行为基线：本文件只测其余维护任务，故给最小替身
        { provide: BehaviorBaselineService, useValue: { scan: jest.fn().mockResolvedValue([]) } },
        { provide: AlertWebhookService, useValue: { sendAlert: jest.fn().mockResolvedValue(undefined) } },
        // HS-11 §22.10 债 3：完整性巡检读侧 —— 本文件只测其余维护任务，故给最小替身
        { provide: AuditEvidenceService, useValue: { verifyChain: jest.fn().mockResolvedValue({ valid: true, checked: 0 }) } },
        { provide: OperationAuditService, useValue: { verifyChain: jest.fn().mockResolvedValue({ valid: true, checked: 0 }) } },
        // AW-16 F-64：占位窗口到期清扫；本文件只验「被调用」，清扫本身的判据由它的服务用例覆盖
        { provide: WriteClaimDecisionService, useValue: writeClaimDecision },
        // F-79：同一轮的有界自动重问。判据（档位、上限、跳过）由 `target-status-reconcile.spec.ts` 与
        // `claim-reconcile-schedule.spec.ts` 覆盖；本文件只验「清扫里真的去问了」。
        // The bounded automatic re-ask. Its criteria live in the two specs named above; here we only
        // pin that the sweep actually calls it.
        { provide: AiToolEffectsService, useValue: toolEffects },
        // 0-B：到期清理会调用它；本文件只验「被调用」，墓碑语义由 store 的用例覆盖
        // 0-B: the expiry sweep calls it; this file only pins the call, the tombstone semantics live
        // with the store's own spec.
        { provide: ToolResultBodyStore, useValue: { expireBefore: jest.fn().mockResolvedValue(0) } },
      ],
    }).compile();

    service = moduleRef.get(MaintenanceTasksService);
  });

  /**
   * F-79: the hourly pass does two things now — it queues overdue holds **and** asks the target again.
   * Queuing alone was the hole the item names: after the row reached `awaiting_decision`, nothing
   * ever asked again. The ask itself is covered where its criteria live; here the point is that one
   * pass does both, in that order (the queue this hour is what the ask may act on).
   *
   * F-79：每小时这一趟现在做两件事 —— 把到期占位排队，**并且**再去问目标。只有排队正是本条指出的缺口：
   * 行到了 `awaiting_decision` 之后，再没有东西去问过。询问本身在它判据所在处覆盖；这里只钉住一趟做两件，
   * 且顺序如此（本轮排进队列的行，正是本轮询问可以动作的对象）。
   */
  describe('expireInFlightClaimWindows', () => {
    it('同一趟既缩小窗口又发起有界自动重问', async () => {
      const order: string[] = [];
      writeClaimDecision.sweepOverdue.mockImplementation(async () => {
        order.push('expire');
        return { moved: 2, thresholdMinutes: 60 };
      });
      toolEffects.reconcileDueClaims.mockImplementation(async () => {
        order.push('reconcile');
        return {
          candidates: 2,
          asked: 1,
          converged: 0,
          unresolved: 1,
          skippedUnaskable: 1,
          skippedExhausted: 0,
          skippedNotDue: 0,
          refused: 0,
          deferredByPassCap: 0,
        };
      });

      await service.expireInFlightClaimWindows();

      expect(order).toEqual(['expire', 'reconcile']);
      // No argument: the sweep uses the real clock; the schedule's own clock is a parameter it passes
      // in and its spec drives. / 不传参：清扫用真时钟；计划自己的时钟由它传入，其用例驱动。
      expect(toolEffects.reconcileDueClaims).toHaveBeenCalledWith();
    });
  });

  /**
   * P0-19 ⑧ — the sweep must leave a structured record, and the record must carry the **issue-time**
   * basis rather than anything recomputed now. These three cases pin that sentence.
   *
   * P0-19 ⑧ —— 清扫必须留下结构化记录，且记录带的是**签发时**的依据，而不是此刻重算的任何东西。
   * 三个用例钉住这句话。
   */
  describe('expireStaleConfirmations', () => {
    const expiredRow = {
      token: 'tok-1',
      operatorId: '7',
      toolName: 'create_event',
      args: '{"title":"x"}',
      conversationId: 'conv-1',
      authorization: '{"allowed":true,"tool":"create_event"}',
      decidedAt: new Date('2026-11-06T00:00:00.000Z'),
    };

    it('到期行逐条写一条 tool_confirmation 记录，带签发时依据与用户名快照', async () => {
      confirmationStore.expireStale.mockResolvedValue([expiredRow]);
      usersRepo.find.mockResolvedValue([{ id: 7, username: 'alex' }]);

      await service.expireStaleConfirmations();

      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log.mock.calls[0][0]).toMatchObject({
        userId: '7',
        username: 'alex',
        conversationId: 'conv-1',
        action: 'tool_confirmation',
        outcome: 'timeout',
        tool: 'create_event',
        toolArgs: '{"title":"x"}',
        authorization: '{"allowed":true,"tool":"create_event"}',
      });
    });

    it('没有依据的行照样记录，但 authorization 缺席 —— 不重算一份', async () => {
      confirmationStore.expireStale.mockResolvedValue([{ ...expiredRow, authorization: null }]);
      usersRepo.find.mockResolvedValue([]);

      await service.expireStaleConfirmations();

      const logged = auditService.log.mock.calls[0][0] as { authorization?: string; username?: string };
      expect(logged.authorization).toBeUndefined();
      expect(logged.username).toBeUndefined();
      expect(auditService.log.mock.calls[0][0]).toMatchObject({ outcome: 'timeout', tool: 'create_event' });
    });

    it('没有到期行 → 不写、不打日志', async () => {
      await service.expireStaleConfirmations();

      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredData', () => {
    it('清理过期会话/验证码/已读通知，并置空过期邮箱验证与重置 token', async () => {
      const qb = mockQueryBuilder();
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await service.cleanupExpiredData();

      expect(sessionsRepo.delete).toHaveBeenCalled();
      expect(phoneCodesRepo.delete).toHaveBeenCalled();
      expect(notificationsRepo.delete).toHaveBeenCalled();
      expect(usersRepo.createQueryBuilder).toHaveBeenCalledTimes(3);
      expect(qb.execute).toHaveBeenCalledTimes(3);
    });

    it('清理过期登录锁定', async () => {
      const qb = mockQueryBuilder();
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await service.cleanupExpiredData();

      const whereArgs = qb.where.mock.calls.map((c) => c[0]);
      expect(whereArgs).toContain(
        'locked_until IS NOT NULL AND locked_until < :now',
      );
    });

    it('已读通知保留天数来自配置', async () => {
      const qb = mockQueryBuilder();
      usersRepo.createQueryBuilder.mockReturnValue(qb);
      notificationsRepo.delete.mockResolvedValue({ affected: 0 });

      await service.cleanupExpiredData();

      const [criteria] = notificationsRepo.delete.mock.calls[0];
      expect(criteria.isRead).toBe(true);
      expect(criteria.createdAt).toBeInstanceOf(FindOperator);
    });
  });

  describe('dailyStatsSnapshot', () => {
    it('汇总各表计数并向管理员发送每日快照通知', async () => {
      usersRepo.count.mockResolvedValue(10);
      usersRepo.find.mockResolvedValue([
        { id: 1, role: UserRole.ADMIN },
        { id: 2, role: UserRole.ADMIN },
      ]);

      await service.dailyStatsSnapshot();

      expect(notificationsService.create).toHaveBeenCalledTimes(2);
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          type: 'daily_snapshot',
          title: '每日平台快照',
        }),
      );
    });

    it('无管理员时不发送通知', async () => {
      usersRepo.find.mockResolvedValue([]);

      await service.dailyStatsSnapshot();

      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });
});
