// SPDX-License-Identifier: Apache-2.0

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OperationAuditService } from './operation-audit.service';
import { OperationAuditLog } from './operation-audit-log.entity';
import { AuditChainService } from '../common/audit-chain/audit-chain.service';

describe('OperationAuditService', () => {
  let service: OperationAuditService;
  let chain: jest.Mocked<Pick<AuditChainService, 'computeHash' | 'verifyChain'>>;
  let runner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    query: jest.Mock;
    manager: { save: jest.Mock };
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
  };
  let dataSource: { options: { type: string }; createQueryRunner: jest.Mock };
  const mockRepo = {
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
    findAndCount: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(null),
    }),
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    chain = {
      computeHash: jest.fn().mockReturnValue('hash-1'),
      verifyChain: jest.fn().mockReturnValue({ valid: true, checked: 0 }),
    };
    const saved: Array<Record<string, unknown>> = [];
    runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]), // 锁行 + _lastHash 默认空
      manager: {
        save: jest.fn((_e: unknown, o: Record<string, unknown>) => {
          saved.push(o);
          return Promise.resolve(o);
        }),
      },
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      options: { type: 'postgres' }, // 测 DB 级串行锁路径（roadmap §22.10 B）；sqlite 走 _tail（单写者）
      createQueryRunner: jest.fn().mockReturnValue(runner),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationAuditService,
        { provide: getRepositoryToken(OperationAuditLog), useValue: mockRepo },
        { provide: AuditChainService, useValue: chain },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<OperationAuditService>(OperationAuditService);
    (service as any).__saved = saved;
  });

  describe('log（HS-11 哈希链）', () => {
    it('persists a log entry with truncated body + hash chain', async () => {
      const longBody = 'x'.repeat(3000);
      chain.computeHash.mockReturnValue('computed-hash');
      await service.log({
        userId: 1,
        action: 'CREATE',
        method: 'POST',
        path: '/events',
        requestBody: longBody,
        ip: '1.1.1.1',
        userAgent: 'ua',
        statusCode: 201,
      });

      const saved = (service as any).__saved[0];
      expect(saved.userId).toBe(1);
      expect(saved.action).toBe('CREATE');
      expect(saved.requestBody.length).toBeLessThanOrEqual(2000);
      expect(chain.computeHash).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ path: '/events', method: 'POST' }),
      );
      expect(saved.prevHash).toBeNull();
      expect(saved.hash).toBe('computed-hash');
    });

    it('swallows save errors silently (audit must not fail business)', async () => {
      mockRepo.save.mockRejectedValue(new Error('db down'));

      await expect(service.log({ action: 'CREATE', method: 'POST', path: '/x' }))
        .resolves.toBeUndefined();
    });

    it('log 处理空可选字段（?? null 兜底）', async () => {
      chain.computeHash.mockReturnValue('h');
      await service.log({ action: 'CREATE', method: 'POST', path: '/x' });

      const saved = (service as any).__saved[0];
      expect(saved.userId).toBeNull();
      expect(saved.featureKey).toBeNull();
      expect(saved.featureFallback).toBeNull();
      expect(saved.targetId).toBeNull();
      expect(saved.requestBody).toBeNull();
      expect(saved.ip).toBeNull();
      expect(saved.userAgent).toBeNull();
      expect(saved.statusCode).toBeNull();
    });

    it('G-1：authorization 授权依据快照落库，但链外（不入 hash payload，防破链）', async () => {
      chain.computeHash.mockReturnValue('g1-hash');
      const snapshot = JSON.stringify({ allowed: true, role: 'user', basis: 'casl:own-scope(handler-enforced)', feature: 'crm.customer.update', statusCode: 200 });
      await service.log({
        userId: 7,
        action: 'UPDATE',
        method: 'PATCH',
        path: '/crm/customers/42',
        changes: '[{"field":"status","before":"active","after":"inactive"}]',
        businessEvent: 'CustomerStatusUpdated',
        authorization: snapshot,
        statusCode: 200,
      });

      const saved = (service as any).__saved[0];
      expect(saved.authorization).toBe(snapshot); // 存库保留
      const hashPayload = chain.computeHash.mock.calls[0][1] as Record<string, unknown>;
      expect(hashPayload).not.toHaveProperty('authorization');
      expect(hashPayload).not.toHaveProperty('changes');
      expect(hashPayload).not.toHaveProperty('businessEvent');
      expect(saved.hash).toBe('g1-hash');
    });

    it('log 截断 ip/userAgent/requestBody 至安全上限', async () => {
      await service.log({
        action: 'CREATE',
        method: 'POST',
        path: '/x',
        ip: '1'.repeat(100),
        userAgent: 'u'.repeat(300),
        requestBody: 'b'.repeat(3000),
      });

      const saved = (service as any).__saved[0];
      expect(saved.ip.length).toBe(64);
      expect(saved.userAgent.length).toBe(255);
      expect(saved.requestBody.length).toBe(2000);
    });

    it('log 链接上一条哈希（prevHash 非空）', async () => {
      runner.query.mockImplementation((sql: string) =>
        String(sql).includes('FROM "operation_audit_logs"')
          ? Promise.resolve([{ hash: 'prev-hash' }])
          : Promise.resolve([]),
      );
      chain.computeHash.mockReturnValue('new-hash');
      await service.log({ action: 'CREATE', method: 'POST', path: '/x' });

      expect(chain.computeHash).toHaveBeenCalledWith('prev-hash', expect.anything());
      const saved = (service as any).__saved[0];
      expect(saved.prevHash).toBe('prev-hash');
      expect(saved.hash).toBe('new-hash');
    });

    it('verifyChain 沿 id 升序取数并委托链校验', async () => {
      mockRepo.find.mockResolvedValue([{ id: 1, prevHash: null, hash: 'a' }]);
      await service.verifyChain();
      expect(mockRepo.find).toHaveBeenCalledWith({ order: { id: 'ASC' } });
      expect(chain.verifyChain).toHaveBeenCalled();
    });

    it('verifyChain 委托 _payload 行映射（null 兜底）', async () => {
      mockRepo.find.mockResolvedValue([{ id: 1, prevHash: null, hash: 'a' }]);
      chain.verifyChain.mockImplementation(
        (rows: unknown[], map: (row: object) => Record<string, unknown>) => {
          map(rows[0] as object);
          return { valid: true, checked: 1 };
        },
      );

      await service.verifyChain();
      expect(chain.verifyChain).toHaveBeenCalled();
    });

    it('E-2：broken 链返回断点窗口切片并标记断点行（含 method/path）', async () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1, prevHash: i === 0 ? null : `h${i}`, hash: `h${i + 1}`,
        createdAt: new Date(), action: 'CREATE', method: 'POST', path: '/api/v1/events', statusCode: 201,
      }));
      mockRepo.find.mockResolvedValue(rows);
      chain.verifyChain.mockReturnValue({ valid: false, checked: 10, brokenIndex: 11 });
      const result = await service.verifyChain();
      const brokenNode = result.chain.find((n) => n.broken);
      expect(brokenNode).toBeDefined();
      expect(brokenNode!.id).toBe(11);
      expect(brokenNode!.method).toBe('POST');
      expect(brokenNode!.path).toBe('/api/v1/events');
    });
  });

  describe('getLogs', () => {
    function mockQueryBuilder(rows: any[] = []) {
      const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rows),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      mockRepo.count.mockResolvedValue(rows.length);
      return qb;
    }

    it('paginates and orders by createdAt desc, attaching username', async () => {
      const qb = mockQueryBuilder([
        { log_id: 1, log_user_id: 2, log_action: 'CREATE', log_method: 'POST', log_path: '/events', log_feature_key: 'events.create', log_feature_fallback: null, log_target_id: null, log_request_body: null, log_ip: null, log_user_agent: null, log_status_code: 201, log_createdAt: new Date(), username: 'alex' },
      ]);

      const result = await service.getLogs(1, 20);

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        id: 1,
        userId: 2,
        action: 'CREATE',
        featureKey: 'events.create',
        username: 'alex',
      });
      expect(qb.leftJoin).toHaveBeenCalledWith('users', 'u', 'u.id = log.userId');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('filters by userId when provided', async () => {
      const qb = mockQueryBuilder();

      await service.getLogs(2, 10, 5);

      expect(qb.where).toHaveBeenCalledWith('log.userId = :userId', { userId: 5 });
    });

    it('filters by since + userId 组合（andWhere + count 带 userId）', async () => {
      const qb = mockQueryBuilder();
      const since = new Date('2026-08-01');

      await service.getLogs(1, 20, 5, since);

      expect(qb.where).toHaveBeenCalledWith('log.userId = :userId', { userId: 5 });
      expect(qb.andWhere).toHaveBeenCalledWith('log.createdAt >= :since', { since });
      expect(mockRepo.count).toHaveBeenCalledWith({
        where: { userId: 5, createdAt: expect.anything() },
      });
    });

    it('filters by since only（count 不带 userId）', async () => {
      const qb = mockQueryBuilder();
      const since = new Date('2026-08-01');

      await service.getLogs(1, 20, undefined, since);

      expect(qb.andWhere).toHaveBeenCalledWith('log.createdAt >= :since', { since });
      expect(mockRepo.count).toHaveBeenCalledWith({
        where: { createdAt: expect.anything() },
      });
    });

    it('maps rows with null userId/statusCode/username to null', async () => {
      mockQueryBuilder([
        { log_id: 1, log_user_id: null, log_action: 'LOGIN', log_method: 'POST', log_path: '/auth/login', log_feature_key: null, log_feature_fallback: null, log_target_id: null, log_request_body: null, log_ip: null, log_user_agent: null, log_status_code: null, log_createdAt: new Date(), username: null },
      ]);

      const result = await service.getLogs(1, 20);

      expect(result.items[0].userId).toBeNull();
      expect(result.items[0].statusCode).toBeNull();
      expect(result.items[0].username).toBeNull();
    });
  });

  describe('getStats', () => {
    it('groups counts by action', async () => {
      mockRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { action: 'CREATE', count: '3' },
          { action: 'LOGIN', count: '2' },
        ]),
      });

      const stats = await service.getStats();

      expect(stats).toEqual({ CREATE: 3, LOGIN: 2 });
    });

    it('getStats 支持 since 过滤（where 分支）', async () => {
      mockRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

      const stats = await service.getStats(new Date('2026-08-01'));

      expect(stats).toEqual({});
    });
  });

  describe('log sqlite 分支（进程内串行 _tail）', () => {
    function sqliteMock() {
      (dataSource.options as any).type = 'sqlite';
      mockRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ hash: 'prev-h' }),
      });
    }

    it('走 _tail 串行写链 + queryBuilder _lastHash', async () => {
      sqliteMock();
      chain.computeHash.mockReturnValue('sqlite-hash');
      await service.log({ action: 'CREATE', method: 'POST', path: '/x', userId: 7 });

      expect(mockRepo.save).toHaveBeenCalled();
      const saved = mockRepo.save.mock.calls[0][0];
      expect(saved.prevHash).toBe('prev-h');
      expect(saved.hash).toBe('sqlite-hash');
      expect(saved.userId).toBe(7);
    });

    it('落库失败静默（sqlite catch 不抛）', async () => {
      sqliteMock();
      mockRepo.save.mockRejectedValue(new Error('sqlite down'));
      await expect(service.log({ action: 'CREATE', method: 'POST', path: '/x' }))
        .resolves.toBeUndefined();
    });
  });

  describe('log postgres 回滚错误分支', () => {
    it('写链失败 → rollback + 静默', async () => {
      runner.manager.save.mockRejectedValue(new Error('pg down'));
      await expect(service.log({ action: 'CREATE', method: 'POST', path: '/x' }))
        .resolves.toBeUndefined();
      expect(runner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('findByTargetId (A-2 业务实体行为史)', () => {
    function qbMock(rows: any[] = []) {
      const qb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    }

    it('基础查询：targetId 过滤 + id 升序', async () => {
      const qb = qbMock([{ id: 1 }]);
      const rows = await service.findByTargetId('1', []);
      expect(qb.where).toHaveBeenCalledWith('log.targetId = :targetId', { targetId: '1' });
      expect(qb.orderBy).toHaveBeenCalledWith('log.createdAt', 'ASC');
      expect(rows).toHaveLength(1);
    });

    it('since + pathSubstrings 组合（AND 拼接防跨资源碰撞）', async () => {
      const qb = qbMock();
      await service.findByTargetId('3', ['/crm/tasks/', '/pm/tasks/'], new Date('2026-08-01'));
      expect(qb.andWhere).toHaveBeenCalledWith('log.createdAt >= :since', { since: expect.anything() });
      expect(qb.andWhere).toHaveBeenCalledWith('(log.path LIKE :p0 OR log.path LIKE :p1)', {
        p0: '%/crm/tasks/%',
        p1: '%/pm/tasks/%',
      });
      expect(qb.getMany).toHaveBeenCalled();
    });
  });
});
