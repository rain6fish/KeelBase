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
    leftJoin: jest.fn().mockReturnThis(),
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

describe('AdminService · 监控/概览/用户详情/会话/广播', () => {
  let service: AdminService;
  let usersRepo: ReturnType<typeof mockRepo>;
  let sessionsRepo: ReturnType<typeof mockRepo>;
  let aiAuditRepo: ReturnType<typeof mockRepo>;
  let notificationsRepo: ReturnType<typeof mockRepo>;
  let configService: { get: jest.Mock };
  let metricsService: {
    httpRequestsTotal: { get: jest.Mock };
    httpRequestsInFlight: { get: jest.Mock };
    httpRequestDurationSeconds: { get: jest.Mock };
  };
  let dataSource: { query: jest.Mock };
  let notify: { create: jest.Mock };

  beforeEach(async () => {
    usersRepo = mockRepo();
    sessionsRepo = mockRepo();
    aiAuditRepo = mockRepo();
    notificationsRepo = mockRepo();
    configService = { get: jest.fn((k: string, d?: unknown) => (k === 'REDIS_URL' ? '' : d)) };
    notify = { create: jest.fn().mockResolvedValue({}) };
    metricsService = {
      httpRequestsTotal: { get: jest.fn().mockResolvedValue({ values: [{ value: 100, labels: { status: '200' } }] }) },
      httpRequestsInFlight: { get: jest.fn().mockResolvedValue({ values: [{ value: 3 }] }) },
      httpRequestDurationSeconds: { get: jest.fn().mockResolvedValue({ values: [{ value: 80, labels: { le: '0.1' } }, { value: 95, labels: { le: '0.2' } }, { value: 100, labels: { le: '+Inf' } }] }) },
    };
    dataSource = { query: jest.fn().mockResolvedValue([]), options: { type: 'better-sqlite3' } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Event), useValue: mockRepo() },
        { provide: getRepositoryToken(Todo), useValue: mockRepo() },
        { provide: getRepositoryToken(Notification), useValue: notificationsRepo },
        { provide: getRepositoryToken(UserSession), useValue: sessionsRepo },
        { provide: getRepositoryToken(OperationAuditLog), useValue: mockRepo() },
        { provide: getRepositoryToken(AiAuditLog), useValue: aiAuditRepo },
        { provide: getRepositoryToken(AiConversation), useValue: mockRepo() },
        { provide: getRepositoryToken(KnowledgeArticle), useValue: mockRepo() },
        { provide: NotificationsService, useValue: notify },
        { provide: MetricsService, useValue: metricsService },
        { provide: ConfigService, useValue: configService },
        { provide: DataSource, useValue: dataSource },
        {
          provide: EncryptionService,
          useValue: { decrypt: jest.fn((v: string) => (v === 'ENC_PHONE' ? '13800138000' : v)) },
        },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  it('getMonitorSummary 聚合计数/健康/依赖/指标（redis 未配置 → down）', async () => {
    usersRepo.count.mockResolvedValue(10);
    const result = await service.getMonitorSummary();
    expect(result.health).toMatchObject({ status: 'ok', nodeEnv: 'development' });
    expect(result.dependencies).toMatchObject({ database: 'up', redis: 'down', queue: 'down', storage: 'local' });
    expect(result.counts.users).toBe(10);
    expect(result.metrics).toMatchObject({ requestRateRps: 1.67, errorRatePct: 0, latencyP95Ms: 200, inFlight: 3 });
  });

  it('getMonitorSummary 指标含 5xx 错误率与 p95 插值', async () => {
    metricsService.httpRequestsTotal.get.mockResolvedValue({
      values: [
        { value: 90, labels: { status: '200' } },
        { value: 10, labels: { status: '500' } },
      ],
    });
    const result = await service.getMonitorSummary();
    expect(result.metrics.errorRatePct).toBe(10);
  });

  it('getMonitorSummary 指标读取异常时降级为 null', async () => {
    metricsService.httpRequestsTotal.get.mockRejectedValue(new Error('metrics down'));
    const result = await service.getMonitorSummary();
    expect(result.metrics).toEqual({ requestRateRps: null, errorRatePct: null, latencyP95Ms: null, inFlight: null });
  });

  it('_checkRedis：非法 URL 抛错 → false', async () => {
    configService.get.mockImplementation((k: string) => (k === 'REDIS_URL' ? '::bad url::' : undefined));
    await expect((service as any)._checkRedis()).resolves.toBe(false);
  });

  it('getOverview 聚合计数/存储/趋势', async () => {
    dataSource.query.mockResolvedValue([{ date: '2026-08-10', count: 3 }]);
    const result = await service.getOverview(new Date('2026-08-01'));
    expect(result.counts).toHaveProperty('users');
    expect(result.storage.driver).toBe('local');
    expect(result.trend).toEqual([{ date: '2026-08-10', count: 3 }]);
  });

  it('getOverview 趋势查询异常返回空数组', async () => {
    dataSource.query.mockRejectedValue(new Error('boom'));
    const result = await service.getOverview(new Date());
    expect(result.trend).toEqual([]);
  });

  it('getUserDetail 脱敏 email/phone 并剔除隐私字段', async () => {
    usersRepo.findOne.mockResolvedValue({
      id: 1,
      username: 'alice',
      email: 'alice@example.com',
      phone: 'ENC_PHONE',
      bio: 'secret',
      dateOfBirth: new Date(),
      firstName: 'A',
      password: 'hash',
      refreshTokenHash: 'rh',
      loginAttempts: 0,
      lockedUntil: null,
    });
    sessionsRepo.find.mockResolvedValue([{ id: 1, deviceName: 'Chrome', ip: '1.2.3.4', lastActiveAt: new Date(), createdAt: new Date() }]);
    notificationsRepo.find.mockResolvedValue([{ id: 1, title: 'hi', body: null, type: 'system', isRead: false, createdAt: new Date() }]);
    aiAuditRepo.count.mockResolvedValue(2);
    aiAuditRepo.qb.getRawOne.mockResolvedValue({ prompt: '100', completion: '50' });

    const result = await service.getUserDetail(1);
    expect(result.email).toBe('a***@example.com');
    expect(result.phone).toBe('138****8000');
    expect(result).not.toHaveProperty('bio');
    expect(result).not.toHaveProperty('dateOfBirth');
    expect(result).not.toHaveProperty('password');
    expect(result.sessions).toHaveLength(1);
    expect(result.notifications).toHaveLength(1);
    expect(result.counts.totalTokens).toBe(150);
  });

  it('getUserDetail 无手机号时不含 phone；用户不存在抛 NotFound', async () => {
    usersRepo.findOne.mockResolvedValueOnce({ id: 1, username: 'bob', email: 'b@x.com' });
    const result = await service.getUserDetail(1);
    expect(result).not.toHaveProperty('phone');

    usersRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.getUserDetail(99)).rejects.toThrow('用户不存在');
  });

  it('getSessions 映射原始查询结果为会话视图', async () => {
    sessionsRepo.qb.getRawMany.mockResolvedValue([
      { id: '1', userId: '2', username: 'alice', deviceName: 'iOS', ip: '10.0.0.1', createdAt: '2026-08-01T00:00:00.000Z', lastActiveAt: '2026-08-02T00:00:00.000Z' },
    ]);
    const rows = await service.getSessions();
    expect(rows[0]).toEqual({ id: 1, userId: 2, username: 'alice', deviceName: 'iOS', ip: '10.0.0.1', createdAt: '2026-08-01T00:00:00.000Z', lastActiveAt: '2026-08-02T00:00:00.000Z' });
  });

  it('getSessions 空值映射为 null', async () => {
    sessionsRepo.qb.getRawMany.mockResolvedValue([
      { id: '1', userId: '2', username: null, deviceName: null, ip: null, createdAt: null, lastActiveAt: null },
    ]);
    const rows = await service.getSessions();
    expect(rows[0]).toEqual({ id: 1, userId: 2, username: null, deviceName: null, ip: null, createdAt: null, lastActiveAt: null });
  });

  it('revokeSession 存在则删除；不存在仅告警不抛错', async () => {
    sessionsRepo.findOne.mockResolvedValue({ id: 1, userId: 2 });
    await service.revokeSession(1);
    expect(sessionsRepo.delete).toHaveBeenCalledWith({ id: 1 });

    sessionsRepo.findOne.mockResolvedValue(null);
    await expect(service.revokeSession(99)).resolves.toBeUndefined();
    expect(sessionsRepo.delete).toHaveBeenCalledTimes(1);
  });

  it('broadcast：指定用户 → selected 模式', async () => {
    await service.broadcast({ title: '通知', body: '内容', type: 'info', userIds: [1, 2] });
    expect(notify.create).toHaveBeenCalledTimes(2);
    expect(notify.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, title: '通知' }));
  });

  it('broadcast：未指定用户 → 全体用户 all 模式', async () => {
    usersRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const result = await service.broadcast({ title: '公告' });
    expect(result).toEqual({ sent: 3, mode: 'all' });
  });

  it('broadcast：无用户返回 0；单用户失败不影响其他', async () => {
    usersRepo.find.mockResolvedValue([]);
    await expect(service.broadcast({ title: 'x' })).resolves.toEqual({ sent: 0 });

    notify.create.mockRejectedValueOnce(new Error('nope')).mockResolvedValueOnce({});
    const result = await service.broadcast({ title: 'y', userIds: [1, 2] });
    expect(result.sent).toBe(1);
  });
});
