// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { User } from '../common/entities/user.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { UserSession } from '../auth/user-session.entity';
import { OperationAuditLog } from '../operation-audit/operation-audit-log.entity';
import { AiAuditLog } from '../ai/audit/ai-audit-log.entity';
import { AiConversation } from '../ai/conversation/ai-conversation.entity';
import { KnowledgeArticle } from '../ai/rag/knowledge-article.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { MetricsService } from '../metrics/metrics.service';
import { EncryptionService } from '../common/utils/encryption';
import { AdminService } from './admin.service';

function mockQB() {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue({ prompt: '10', completion: '20' }),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };
}

function mockRepo(overrides: Record<string, jest.Mock> = {}) {
  const qb = mockQB();
  const repo = {
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => qb),
    ...overrides,
  };
  (repo as any).qb = qb;
  return repo;
}

describe('AdminService · D.8 运维单页聚合', () => {
  let service: AdminService;
  let opAuditRepo: ReturnType<typeof mockRepo>;
  let aiAuditRepo: ReturnType<typeof mockRepo>;
  let configService: { get: jest.Mock };
  let metricsService: {
    httpRequestsTotal: { get: jest.Mock };
    httpRequestsInFlight: { get: jest.Mock };
    httpRequestDurationSeconds: { get: jest.Mock };
  };
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    opAuditRepo = mockRepo();
    aiAuditRepo = mockRepo();
    configService = { get: jest.fn((k: string, d?: unknown) => (k === 'REDIS_URL' ? '' : d)) };
    metricsService = {
      httpRequestsTotal: { get: jest.fn().mockResolvedValue({ values: [{ value: 90, labels: { status: '200' } }, { value: 10, labels: { status: '500' } }] }) },
      httpRequestsInFlight: { get: jest.fn().mockResolvedValue({ values: [{ value: 3 }] }) },
      httpRequestDurationSeconds: { get: jest.fn().mockResolvedValue({ values: [{ value: 80, labels: { le: '0.1' } }, { value: 95, labels: { le: '0.2' } }, { value: 100, labels: { le: '+Inf' } }] }) },
    };
    dataSource = { query: jest.fn().mockResolvedValue([]), options: { type: 'sqlite' } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: mockRepo() },
        { provide: getRepositoryToken(Event), useValue: mockRepo() },
        { provide: getRepositoryToken(Todo), useValue: mockRepo() },
        { provide: getRepositoryToken(Notification), useValue: mockRepo() },
        { provide: getRepositoryToken(UserSession), useValue: mockRepo() },
        { provide: getRepositoryToken(OperationAuditLog), useValue: opAuditRepo },
        { provide: getRepositoryToken(AiAuditLog), useValue: aiAuditRepo },
        { provide: getRepositoryToken(AiConversation), useValue: mockRepo() },
        { provide: getRepositoryToken(KnowledgeArticle), useValue: mockRepo() },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: MetricsService, useValue: metricsService },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: dataSource },
        { provide: EncryptionService, useValue: { decrypt: jest.fn((v: string) => v) } },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  it('错误率 10% + Redis 未配置 → 派生 warning 错误率 + critical Redis 告警', async () => {
    const result = await service.getOpsSummary();
    expect(result.alerts.some((a) => a.level === 'warning' && a.title === '错误率偏高')).toBe(true);
    expect(result.alerts.some((a) => a.level === 'critical' && a.title === 'Redis 不可用')).toBe(true);
  });

  it('近 24h 操作审计 4xx/5xx 分组 + AI 错误数', async () => {
    opAuditRepo.qb.getRawMany.mockResolvedValue([
      { code: '500', count: '3' },
      { code: '404', count: '2' },
    ]);
    aiAuditRepo.count.mockResolvedValue(2);
    const result = await service.getOpsSummary();
    expect(result.logErrors.opErrors).toEqual([
      { code: 500, count: 3 },
      { code: 404, count: 2 },
    ]);
    expect(result.logErrors.aiErrors).toBe(2);
    // 有错误 → 派生 warning 告警
    expect(result.alerts.some((a) => a.title === '近 24h 有 4xx/5xx')).toBe(true);
  });

  it('趋势补全最近 7 天，无日志的天补 0', async () => {
    opAuditRepo.qb.getRawMany.mockResolvedValue([]);
    const result = await service.getOpsSummary();
    expect(result.trend).toHaveLength(7);
    expect(result.trend.every((t: { total: number }) => t.total === 0)).toBe(true);
  });

  // ── 补充覆盖：告警阈值分级 / 存储用量降级 ──────────────────────────────────
  // 注：_getStorageUsage 的 fs 读取与 _checkRedis 的 net 探测用 `await import('fs'/'net')`
  // 动态加载，jest（无 --experimental-vm-modules）对内置模块动态 import 直接抛错，
  // 故只测「非 local 直接返回」这条不触达 import 的路径。

  it('_deriveAlerts：错误率 >15% → critical，5-15% → warning，≤5% 无错误告警', () => {
    const s = service as any;
    const noErrors = { opErrors: [], aiErrors: 0 };
    const crit = s._deriveAlerts({ errorRatePct: 20 }, true, noErrors);
    expect(crit.some((a: any) => a.level === 'critical' && a.title === '错误率过高')).toBe(true);
    expect(crit.some((a: any) => a.title === '错误率偏高')).toBe(false);

    const warn = s._deriveAlerts({ errorRatePct: 8 }, true, noErrors);
    expect(warn.some((a: any) => a.level === 'warning' && a.title === '错误率偏高')).toBe(true);

    const none = s._deriveAlerts({ errorRatePct: 2 }, true, noErrors);
    expect(none.some((a: any) => a.title.includes('错误率'))).toBe(false);
  });

  it('_getStorageUsage：非 local 驱动返回 null（不读磁盘）', async () => {
    configService.get.mockImplementation((k: string, d?: unknown) => (k === 'STORAGE_DRIVER' ? 's3' : d));
    const result = await (service as any)._getStorageUsage();
    expect(result).toEqual({ driver: 's3', bytes: null });
  });
});
