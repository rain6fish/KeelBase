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

  describe('revoke', () => {
    it('软删目标 event（衔接 RG-3）', async () => {
      repo.findOne.mockResolvedValue({ id: 3, resultType: 'event', resultId: 42 });
      const eventRepo = { findOne: jest.fn().mockResolvedValue({ id: 42 }), softDelete: jest.fn() };
      entityManager.getRepository.mockReturnValue(eventRepo);

      const res = await service.revoke(3);
      expect(res).toEqual({ revoked: true, effectId: 3 });
      expect(eventRepo.softDelete).toHaveBeenCalledWith(42);
    });

    it('记录不存在 → null', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.revoke(99)).toBeNull();
    });
  });
});
