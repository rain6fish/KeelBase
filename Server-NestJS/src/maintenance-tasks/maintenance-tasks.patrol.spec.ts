// SPDX-License-Identifier: Apache-2.0

/**
 * HS-11 §22.10 debt 3: the audit-chain integrity patrol raises the alarm a fork never gets.
 *
 * Paired readings on a **scratch** sqlite database (never the shared `data/front.sqlite`): a healthy
 * chain passes silently, a tampered one is reported. The chains are real — rows come from the real
 * `AuditService` / `OperationAuditService` write paths and the real services verify them over the same
 * DataSource — so this pins behaviour, not a mock. Reading ② is what goes red if the alert block is
 * removed. One service instance spans the three readings on purpose: the edge-trigger in ③ only means
 * anything if the "already broken" state survives from ②.
 *
 * HS-11 §22.10 债 3：审计链完整性巡检发出「分叉本不会得到」的告警。
 *
 * 在**临时** sqlite 库（绝不碰共享 `data/front.sqlite`）上做**成对读数**：健康链静默通过、被篡改的链被
 * 报出。两条链是真的——行由真实的 `AuditService` / `OperationAuditService` 写入路径产生、由真实服务在同一个
 * DataSource 上校验——故钉的是行为、不是 mock。**拿掉告警块 ⇒ 读数 ② 变红**。三个读数共用**同一个**服务
 * 实例是有意的：③ 的边沿触发只有在「已断链」状态从 ② 留下来时才有意义。
 */
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MaintenanceTasksService } from './maintenance-tasks.service';
import { AuditChainService } from '../common/audit-chain/audit-chain.service';
import { AuditChainLock } from '../common/audit-chain/audit-chain-lock.entity';
import { AuditService } from '../governance-shared/services/audit.service';
import { AuditEvidenceService } from '../governance-shared/services/audit-evidence.service';
import { AiAuditLog } from '../governance-shared/entities/ai-audit-log.entity';
import { AiDailyUsage } from '../governance-shared/entities/ai-daily-usage.entity';
import { AiToolSideEffect } from '../governance-shared/entities/ai-tool-side-effect.entity';
import { OperationAuditService } from '../operation-audit/operation-audit.service';
import { OperationAuditLog } from '../operation-audit/operation-audit-log.entity';

const AUDIT_HMAC_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

describe('审计链完整性巡检（HS-11 §22.10 债 3）', () => {
  let ds: DataSource;
  let service: MaintenanceTasksService;
  const notifications = { create: jest.fn(async () => ({})) };
  const webhook = {
    sendAlert: jest.fn(async (_title: string, _message: string, _meta?: Record<string, unknown>) => undefined),
  };

  beforeAll(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiAuditLog, AiDailyUsage, AiToolSideEffect, AuditChainLock, OperationAuditLog],
      synchronize: true,
    });
    await ds.initialize();
    await ds.getRepository(AuditChainLock).insert({ id: 1, holder: 'seed' });

    const auditChain = new AuditChainService(new ConfigService({ AUDIT_HMAC_KEY }));
    const auditService = new AuditService(ds.getRepository(AiAuditLog), auditChain, ds);
    const opAudit = new OperationAuditService(ds.getRepository(OperationAuditLog), auditChain, ds);
    // 第 4 个构造参数是必填的 coverage（AW-3）；本用例只调 verifyChain，它不读 coverage —— 与单测同法传 stub。
    const evidence = new AuditEvidenceService(
      ds.getRepository(AiAuditLog),
      ds.getRepository(AiToolSideEffect),
      auditChain,
      { forFacts: () => ({}) } as never,
    );

    service = new MaintenanceTasksService(
      {} as never, // sessionsRepo（巡检不用）
      {} as never, // phoneCodesRepo
      { find: async () => [{ id: 1 }, { id: 2 }] } as never, // usersRepo → 两个管理员
      {} as never, // eventsRepo
      {} as never, // todosRepo
      {} as never, // notificationsRepo
      notifications as never,
      { get: () => undefined } as never, // configService（巡检不用）
      {} as never, // confirmationStore
      { scan: jest.fn() } as never, // behaviorBaseline
      webhook as never,
      evidence, // auditEvidence
      opAudit, // operationAudit
    );

    // 走**真实写入路径**铺两条健康链（不直接插表——否则测的是夹具而非链路）
    for (let i = 0; i < 3; i++) {
      await auditService.log({ userId: 'integrity-e2e', action: 'tool_call', detail: `create_todo({"i":${i}})` });
      await opAudit.log({ action: 'create', method: 'POST', path: '/api/v1/events' });
    }
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('① 健康链：巡检静默通过 —— 不通知、不告警', async () => {
    notifications.create.mockClear();
    webhook.sendAlert.mockClear();

    await service.patrolAuditChainIntegrity();

    expect(notifications.create).not.toHaveBeenCalled();
    expect(webhook.sendAlert).not.toHaveBeenCalled();
  });

  it('② 人为断链（改一行字段）：巡检报出 —— 每个管理员收到通知 + webhook 告警，且点名是哪条链', async () => {
    // 篡改 AI 审计链：改掉一行的 payload 字段，使其重算 hash 对不上（真在临时库上造断链）
    await ds.query(`UPDATE ai_audit_logs SET detail = 'tampered' WHERE id = 1`);
    notifications.create.mockClear();
    webhook.sendAlert.mockClear();

    await service.patrolAuditChainIntegrity();

    expect(notifications.create).toHaveBeenCalledTimes(2); // 每个管理员一条
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'audit_chain_integrity_alert' }),
    );
    expect(webhook.sendAlert).toHaveBeenCalledTimes(1);
    expect(webhook.sendAlert.mock.calls[0][0]).toContain('AI 审计链');
  });

  it('③ 边沿触发：仍断链时再巡检 —— 不重复告警（一条一直坏着的链不该每小时刷屏）', async () => {
    notifications.create.mockClear();
    webhook.sendAlert.mockClear();

    await service.patrolAuditChainIntegrity();

    expect(notifications.create).not.toHaveBeenCalled();
    expect(webhook.sendAlert).not.toHaveBeenCalled();
  });
});
