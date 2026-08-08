import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiAuditLog } from './ai-audit-log.entity';
import { AuditService } from './audit.service';

function makeLogRepo() {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
  };
  return {
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
}

describe('AuditService', () => {
  let service: AuditService;
  let repo: ReturnType<typeof makeLogRepo>;

  beforeEach(async () => {
    repo = makeLogRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: getRepositoryToken(AiAuditLog), useValue: repo }],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  describe('countChatsToday（RG-2.1）', () => {
    it('按 userId + 当日 + 非错误过滤统计', async () => {
      repo.createQueryBuilder().getCount.mockResolvedValue(7);

      const count = await service.countChatsToday('42');

      expect(count).toBe(7);
      expect(repo.createQueryBuilder).toHaveBeenCalled();
      const qb = repo.createQueryBuilder();
      expect(qb.where).toHaveBeenCalledWith('log.userId = :userId', { userId: '42' });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'log.createdAt >= :start',
        expect.any(Object),
      );
      expect(qb.andWhere).toHaveBeenCalledWith('log.isError = :err', { err: false });
    });
  });

  describe('log', () => {
    it('保存审计条目', async () => {
      await service.log({ userId: '1', action: 'chat', provider: 'deepseek' });
      expect(repo.save).toHaveBeenCalled();
    });
  });
});
