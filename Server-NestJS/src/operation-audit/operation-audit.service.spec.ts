import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OperationAuditService } from './operation-audit.service';
import { OperationAuditLog } from './operation-audit-log.entity';
import { AuditChainService } from '../common/audit-chain/audit-chain.service';

describe('OperationAuditService', () => {
  let service: OperationAuditService;
  let chain: jest.Mocked<Pick<AuditChainService, 'computeHash' | 'verifyChain'>>;
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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationAuditService,
        { provide: getRepositoryToken(OperationAuditLog), useValue: mockRepo },
        { provide: AuditChainService, useValue: chain },
      ],
    }).compile();

    service = module.get<OperationAuditService>(OperationAuditService);
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

      const saved = mockRepo.save.mock.calls[0][0];
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

    it('verifyChain 沿 id 升序取数并委托链校验', async () => {
      mockRepo.find.mockResolvedValue([{ id: 1, prevHash: null, hash: 'a' }]);
      await service.verifyChain();
      expect(mockRepo.find).toHaveBeenCalledWith({ order: { id: 'ASC' } });
      expect(chain.verifyChain).toHaveBeenCalled();
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
  });
});
