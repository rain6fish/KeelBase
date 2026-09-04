// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken, getEntityManagerToken } from '@nestjs/typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { LocalEntityRevoker, SIDE_EFFECT_REVOKER } from './side-effect-revoker';

describe('AiToolEffectsService (HS-3 幂等与补偿)', () => {
  let service: AiToolEffectsService;
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock;
  };
  let entityManager: { getRepository: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
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
        LocalEntityRevoker,
        { provide: SIDE_EFFECT_REVOKER, useClass: LocalEntityRevoker },
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

    it('E-1：snapshot before/after 写入副作用记录', async () => {
      repo.save.mockResolvedValue({
        id: 1, idempotencyKey: 'k', userId: '1', conversationId: 'c',
        toolName: 'create_event', argsHash: 'abc', resultType: 'event', resultId: 42,
        beforeSnapshot: null, afterSnapshot: '{"id":42,"title":"晨会"}',
      });
      const saved = await service.record(
        { userId: '1', conversationId: 'c', toolName: 'create_event', args: { title: '晨会' } },
        'event',
        42,
        { before: null, after: '{"id":42,"title":"晨会"}' },
      );
      expect(saved.afterSnapshot).toBe('{"id":42,"title":"晨会"}');
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ beforeSnapshot: null, afterSnapshot: '{"id":42,"title":"晨会"}' }),
      );
    });

    it('E-1：不传 snapshot 时快照列为 null', async () => {
      repo.save.mockResolvedValue({ id: 1 });
      await service.record(
        { userId: '1', conversationId: 'c', toolName: 'create_todo', args: { title: 'X' } },
        'todo',
        3,
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ beforeSnapshot: null, afterSnapshot: null }),
      );
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
      expect(res).toMatchObject({ revoked: true, effectId: 3 });
      expect(entityManager.getRepository).toHaveBeenCalledWith('Todo');
      expect(todoRepo.softDelete).toHaveBeenCalledWith(55);
    });

    it('目标已不存在时只记日志不软删', async () => {
      repo.findOne.mockResolvedValue({ id: 3, resultType: 'event', resultId: 999 });
      const eventRepo = { findOne: jest.fn().mockResolvedValue(null), softDelete: jest.fn() };
      entityManager.getRepository.mockReturnValue(eventRepo);

      const res = await service.revoke(3);
      expect(res).toMatchObject({ revoked: true, effectId: 3 });
      expect(eventRepo.softDelete).not.toHaveBeenCalled();
    });

    it('记录不存在 → null', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.revoke(99)).toBeNull();
    });
  });

  describe('revokeOwned（P0-15 用户侧撤销）', () => {
    it('本人撤销 → 软删目标并返回', async () => {
      repo.findOne.mockResolvedValue({ id: 7, userId: '42', resultType: 'event', resultId: 88 });
      const eventRepo = { findOne: jest.fn().mockResolvedValue({ id: 88 }), softDelete: jest.fn() };
      entityManager.getRepository.mockReturnValue(eventRepo);

      const res = await service.revokeOwned(7, '42');
      expect(res).toMatchObject({ revoked: true, effectId: 7 });
      expect(eventRepo.softDelete).toHaveBeenCalledWith(88);
    });

    it('非本人 → null，不软删', async () => {
      repo.findOne.mockResolvedValue({ id: 7, userId: '42', resultType: 'event', resultId: 88 });
      const eventRepo = { findOne: jest.fn(), softDelete: jest.fn() };
      entityManager.getRepository.mockReturnValue(eventRepo);

      const res = await service.revokeOwned(7, '999');
      expect(res).toBeNull();
      expect(eventRepo.softDelete).not.toHaveBeenCalled();
    });

    it('记录不存在 → null', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.revokeOwned(99, '42')).toBeNull();
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

  describe('listOwned（AI Action Center 本人清单）', () => {
    const baseEffect = (id: number, resultType: string, resultId: number) => ({
      id, userId: '42', toolName: 'create_event', conversationId: 'c',
      resultType, resultId, argsHash: 'h', createdAt: new Date(),
    });

    it('只查本人（where userId）并富化目标 + 状态归一（软删→revoked）', async () => {
      repo.findAndCount.mockResolvedValue([
        [baseEffect(1, 'event', 42), baseEffect(2, 'todo', 7)],
        2,
      ]);
      entityManager.getRepository
        .mockReturnValueOnce({ findOne: jest.fn().mockResolvedValue({ title: '晨会', deletedAt: null }) }) // event 未删 → executed
        .mockReturnValueOnce({ findOne: jest.fn().mockResolvedValue({ title: '买牛奶', deletedAt: new Date() }) }); // todo 软删 → revoked

      const result = await service.listOwned('42', { page: 1, limit: 20 });
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: '42' }, order: { createdAt: 'DESC' } }),
      );
      expect(result.total).toBe(2);
      expect(result.items[0]).toMatchObject({ status: 'executed', targetExists: true, targetSoftDeleted: false, targetTitle: '晨会' });
      expect(result.items[1]).toMatchObject({ status: 'revoked', targetExists: true, targetSoftDeleted: true, targetTitle: '买牛奶' });
      // 数据最小化：清单不回显 argsHash / before/after 快照
      expect(result.items[0]).not.toHaveProperty('argsHash');
      expect(result.items[0]).not.toHaveProperty('beforeSnapshot');
      expect(result.items[0]).not.toHaveProperty('afterSnapshot');
    });

    it('目标不存在 → targetExists=false 且 status=executed（无软删记录）', async () => {
      repo.findAndCount.mockResolvedValue([[baseEffect(1, 'pm_task', 99)], 1]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
      const result = await service.listOwned('42', {});
      expect(result.items[0]).toMatchObject({ targetExists: false, targetSoftDeleted: false, status: 'executed', targetTitle: null });
    });

    it('空清单 → total 0 items []', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
      const result = await service.listOwned('42', {});
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('limit 钳制 1–50', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
      await service.listOwned('42', { limit: 999 });
      expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
      await service.listOwned('42', { limit: 0 });
      expect(repo.findAndCount).toHaveBeenLastCalledWith(expect.objectContaining({ take: 1 }));
    });
  });

  describe('listForConversation（P0-14 轨迹副作用）', () => {
    it('按对话取副作用并富化目标当前状态', async () => {
      repo.find.mockResolvedValue([
        { id: 1, resultType: 'event', resultId: 88, action: 'create_event', createdAt: new Date() },
        { id: 2, resultType: 'crm_task', resultId: 7, action: 'create_followup_task', createdAt: new Date() },
      ]);
      const eventRepo = { findOne: jest.fn().mockResolvedValue({ id: 88, title: '会议' }) };
      const crmRepo = { findOne: jest.fn().mockResolvedValue({ id: 7, title: '跟进' }) };
      entityManager.getRepository
        .mockReturnValueOnce(eventRepo)
        .mockReturnValueOnce(crmRepo);

      const items = await service.listForConversation('conv-1');

      expect(repo.find).toHaveBeenCalledWith({ where: { conversationId: 'conv-1' }, order: { createdAt: 'ASC' } });
      expect(entityManager.getRepository).toHaveBeenCalledWith('Event');
      expect(entityManager.getRepository).toHaveBeenCalledWith('CrmTask');
      expect(items[0]).toMatchObject({ targetExists: true, targetTitle: '会议' });
      expect(items[1]).toMatchObject({ targetExists: true, targetTitle: '跟进' });
    });

    it('目标已删除时 targetExists 为 false 且不抛错', async () => {
      repo.find.mockResolvedValue([{ id: 1, resultType: 'pm_task', resultId: 99, createdAt: new Date() }]);
      const pmRepo = { findOne: jest.fn().mockResolvedValue(null) };
      entityManager.getRepository.mockReturnValue(pmRepo);
      const items = await service.listForConversation('conv-2');
      expect(entityManager.getRepository).toHaveBeenCalledWith('PmTask');
      expect(items[0].targetExists).toBe(false);
      expect(items[0].targetTitle).toBeNull();
    });

    it('LocalEntityRevoker 映射副作用类型', () => {
      const revoker = new LocalEntityRevoker({
        ...entityManager,
        connection: { entityMetadatas: [] },
      } as any);
      expect(revoker.canHandle('crm_task')).toBe(true);
      expect(revoker.canHandle('pm_task')).toBe(true);
      expect(revoker.canHandle('app_request')).toBe(true);
      expect(revoker.canHandle('event')).toBe(true);
      expect(revoker.canHandle('todo')).toBe(true); // create_todo 显式映射
      expect(revoker.canHandle('unknown')).toBe(false); // fail closed（未知类型不软删本地实体）
      expect(revoker.canHandle('proxy_call')).toBe(false); // B 路径外部（走 ExternalRevoker）
    });
  });
});
