import { Test } from '@nestjs/testing';
import { getRepositoryToken, getEntityManagerToken } from '@nestjs/typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';

describe('AiToolEffectsService (HS-3 幂等与补偿)', () => {
  let service: AiToolEffectsService;
  let repo: {
    findOne: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock;
  };
  let entityManager: { getRepository: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn((d: any) => d),
    };
    entityManager = {
      getRepository: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        AiToolEffectsService,
        { provide: getRepositoryToken(AiToolSideEffect), useValue: repo },
        { provide: getEntityManagerToken(), useValue: entityManager },
      ],
    }).compile();
    service = module.get(AiToolEffectsService);
  });

  describe('buildKey', () => {
    it('对相同参数生成稳定幂等键（参数顺序无关）', () => {
      const a = AiToolEffectsService.buildKey({
        userId: '1',
        conversationId: 'conv-1',
        toolName: 'create_event',
        args: { title: 'X', startTime: '2026-08-01' },
      });
      const b = AiToolEffectsService.buildKey({
        userId: '1',
        conversationId: 'conv-1',
        toolName: 'create_event',
        args: { startTime: '2026-08-01', title: 'X' },
      });
      expect(a).toBe(b);
    });

    it('不同用户/会话/参数生成不同键', () => {
      const a = AiToolEffectsService.buildKey({
        userId: '1', conversationId: 'c', toolName: 'create_event', args: { title: 'X' },
      });
      const b = AiToolEffectsService.buildKey({
        userId: '2', conversationId: 'c', toolName: 'create_event', args: { title: 'X' },
      });
      expect(a).not.toBe(b);
    });
  });

  describe('findExisting', () => {
    it('同 key 已有副作用 → existing:true', async () => {
      repo.findOne.mockResolvedValue({ id: 5, resultId: 10, resultType: 'event' });
      const res = await service.findExisting('key-1');
      expect(res.existing).toBe(true);
      expect(res.effect?.resultId).toBe(10);
    });

    it('无副作用 → existing:false', async () => {
      repo.findOne.mockResolvedValue(null);
      const res = await service.findExisting('key-1');
      expect(res.existing).toBe(false);
    });
  });

  describe('record', () => {
    it('记录副作用并返回', async () => {
      repo.save.mockResolvedValue({
        id: 1,
        idempotencyKey: 'k',
        userId: '1',
        conversationId: 'c',
        toolName: 'create_event',
        argsHash: 'abc',
        resultType: 'event',
        resultId: 42,
      });
      const saved = await service.record(
        { userId: '1', conversationId: 'c', toolName: 'create_event', args: { title: 'X' } },
        'event',
        42,
      );
      expect(saved.resultId).toBe(42);
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('record', () => {
    it('并发唯一冲突时幂等跳过返回已有记录', async () => {
      repo.save.mockRejectedValueOnce(new Error('SQLITE_CONSTRAINT: UNIQUE'));
      repo.findOne.mockResolvedValue({ id: 9, idempotencyKey: 'k', resultType: 'event', resultId: 7 });
      const saved = await service.record(
        { userId: '1', conversationId: 'c', toolName: 'create_event', args: { title: 'X' } },
        'event',
        7,
      );
      expect(saved.id).toBe(9);
    });
  });

  describe('revoke', () => {
    it('软删目标 todo', async () => {
      repo.findOne.mockResolvedValue({ id: 3, resultType: 'todo', resultId: 55 });
      const todoRepo = { findOne: jest.fn().mockResolvedValue({ id: 55 }), softDelete: jest.fn() };
      entityManager.getRepository.mockReturnValue(todoRepo);

      const res = await service.revoke(3);
      expect(res).toEqual({ revoked: true, effectId: 3 });
      expect(entityManager.getRepository).toHaveBeenCalledWith('Todo');
      expect(todoRepo.softDelete).toHaveBeenCalledWith(55);
    });

    it('目标已不存在时只记日志不软删', async () => {
      repo.findOne.mockResolvedValue({ id: 3, resultType: 'event', resultId: 999 });
      const eventRepo = { findOne: jest.fn().mockResolvedValue(null), softDelete: jest.fn() };
      entityManager.getRepository.mockReturnValue(eventRepo);

      const res = await service.revoke(3);
      expect(res).toEqual({ revoked: true, effectId: 3 });
      expect(eventRepo.softDelete).not.toHaveBeenCalled();
    });

    it('记录不存在 → null', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.revoke(99)).toBeNull();
    });
  });

  describe('list（含目标状态富化）', () => {
    const baseEffect = (id: number, resultType: string, resultId: number) => ({
      id, userId: '1', toolName: 'create_event', conversationId: 'c',
      resultType, resultId, argsHash: 'h', createdAt: new Date(),
    });

    it('按 userId 过滤并附带目标存在/软删/标题', async () => {
      repo.findAndCount.mockResolvedValue([
        [baseEffect(1, 'event', 42), baseEffect(2, 'todo', 7)],
        2,
      ]);
      entityManager.getRepository
        .mockReturnValueOnce({ findOne: jest.fn().mockResolvedValue({ title: '晨会', deletedAt: null }) }) // event
        .mockReturnValueOnce({ findOne: jest.fn().mockResolvedValue({ title: '买牛奶', deletedAt: new Date() }) }); // todo 已软删

      const result = await service.list({ userId: 1, page: 1, limit: 20 });
      expect(result.total).toBe(2);
      expect(result.items[0]).toMatchObject({ targetExists: true, targetSoftDeleted: false, targetTitle: '晨会' });
      expect(result.items[1]).toMatchObject({ targetExists: true, targetSoftDeleted: true, targetTitle: '买牛奶' });
      expect(entityManager.getRepository).toHaveBeenCalledWith('Event');
      expect(entityManager.getRepository).toHaveBeenCalledWith('Todo');
    });

    it('目标不存在时 targetExists=false', async () => {
      repo.findAndCount.mockResolvedValue([[baseEffect(1, 'event', 999)], 1]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
      const result = await service.list({});
      expect(result.items[0]).toMatchObject({ targetExists: false, targetSoftDeleted: false, targetTitle: null });
    });

    it('limit 钳制 100', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
      await service.list({ limit: 999 });
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });
});
