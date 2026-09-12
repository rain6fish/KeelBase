// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken, getEntityManagerToken } from '@nestjs/typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { LocalEntityRevoker, SIDE_EFFECT_REVOKER } from './side-effect-revoker';
import { ToolRegistry } from '../tools/tool-registry';
import { resolveRevokeClass } from '../interfaces/tool.interface';

describe('AiToolEffectsService (HS-3 幂等与补偿)', () => {
  let service: AiToolEffectsService;
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock;
    update?: jest.Mock;
  };
  let entityManager: { getRepository: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn((d: any) => d),
      update: jest.fn(),
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

    it('§4 G1：ctx.runId 落 run_id 列；未给 runId → null（单条/免确认写）', async () => {
      repo.save.mockResolvedValue({ id: 1 });
      await service.record(
        { userId: '1', conversationId: 'c', runId: 'run-a', toolName: 'create_event', args: { title: 'X' } },
        'event',
        42,
      );
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-a' }));

      repo.create.mockClear();
      await service.record(
        { userId: '1', conversationId: 'c', toolName: 'create_event', args: { title: 'Y' } },
        'event',
        43,
      );
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ runId: null }));
    });

    it('§4 G1：run_id 不入副作用哈希链 payload（白名单外 → 加列不破历史链）', () => {
      // _chainPayload 是白名单：即使行对象带 runId，入链 payload 也不含它 —— 故加列不改变历史行重算值
      const payload = (service as any)._chainPayload({
        runId: 'run-a',
        toolName: 'create_event',
        userId: '1',
      });
      expect(payload).not.toHaveProperty('runId');
      expect(payload).toHaveProperty('toolName', 'create_event');
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

    it('KB-4 FP-4：非唯一冲突（DB down）→ 如实上抛，不伪装幂等跳过', async () => {
      repo.save.mockRejectedValueOnce(new Error('connection refused'));
      await expect(
        service.record(
          { userId: '1', conversationId: 'c', toolName: 'create_event', args: { title: 'X' } },
          'event',
          7,
        ),
      ).rejects.toThrow('connection refused');
      expect(repo.findOne).not.toHaveBeenCalled();
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

  describe('revokeConversation（G1 会话级批量撤销：作用域判定）', () => {
    const eff = (id: number, userId: string) => ({
      id, userId, resultType: 'event', resultId: 100 + id, conversationId: 'c',
      toolName: 'create_event', argsHash: 'h', createdAt: new Date(),
    });

    it('提供 ownerId → 只纳入该用户的效果（本人作用域）', async () => {
      repo.find.mockResolvedValue([eff(1, '42'), eff(2, '99')]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

      const res = await service.revokeConversation('c', { ownerId: '42' });
      expect(res.total).toBe(1);
      expect(res.results.map((r) => r.effectId)).toEqual([1]);
    });

    it('ownerId 为空串（falsy）→ 不升级为 admin 全作用域（按「未提供」判据而非真值判据）', async () => {
      repo.find.mockResolvedValue([eff(1, '42'), eff(2, '99')]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

      const res = await service.revokeConversation('c', { ownerId: '' });
      // 修复前：'' falsy → 走 else 分支撤全部（total=2）；修复后无人匹配 '' → total=0
      expect(res.total).toBe(0);
      expect(res.results).toEqual([]);
    });

    it('不提供 opts → admin 全作用域（撤该会话全部）', async () => {
      repo.find.mockResolvedValue([eff(1, '42'), eff(2, '99')]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

      const res = await service.revokeConversation('c');
      expect(res.total).toBe(2);
    });
  });

  describe('revokeRun（§4 G1 run 级批量撤销：按 runId 精确圈定比会话更细）', () => {
    const eff = (id: number, userId: string, runId: string) => ({
      id, userId, resultType: 'event', resultId: 100 + id, conversationId: 'c', runId,
      toolName: 'create_event', argsHash: 'h', createdAt: new Date(),
    });

    it('按 runId 查询（非按会话）+ owner 过滤生效', async () => {
      repo.find.mockResolvedValue([eff(1, '42', 'run-a'), eff(2, '99', 'run-a')]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

      const res = await service.revokeRun('run-a', { ownerId: '42' });
      expect(repo.find).toHaveBeenCalledWith({ where: { runId: 'run-a' }, order: { createdAt: 'ASC' } });
      expect(res.runId).toBe('run-a');
      expect(res.total).toBe(1);
      expect(res.results.map((r) => r.effectId)).toEqual([1]);
    });

    it('ownerId 为空串（falsy）→ 不升级为全作用域', async () => {
      repo.find.mockResolvedValue([eff(1, '42', 'run-a')]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

      const res = await service.revokeRun('run-a', { ownerId: '' });
      expect(res.total).toBe(0);
      expect(res.results).toEqual([]);
    });

    it('不提供 opts → admin 全作用域（撤该 run 全部）', async () => {
      repo.find.mockResolvedValue([eff(1, '42', 'run-a'), eff(2, '99', 'run-a')]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

      const res = await service.revokeRun('run-a');
      expect(res.total).toBe(2);
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

    it('D2：由快照导出紧凑变更摘要（created / updated 字段名；仍不回显快照值）', async () => {
      repo.findAndCount.mockResolvedValue([
        [
          { ...baseEffect(1, 'event', 42), beforeSnapshot: null, afterSnapshot: JSON.stringify({ title: '新事件', startTime: 'x' }) },
          { ...baseEffect(2, 'event', 43), beforeSnapshot: JSON.stringify({ title: '旧', status: 'a' }), afterSnapshot: JSON.stringify({ title: '新', status: 'a' }) },
          { ...baseEffect(3, 'event', 44), beforeSnapshot: null, afterSnapshot: null },
        ],
        3,
      ]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue({ title: 't', deletedAt: null }) });

      const result = await service.listOwned('42', {});
      expect(result.items[0].change).toEqual({ kind: 'created', fields: ['title', 'startTime'] });
      expect(result.items[1].change).toEqual({ kind: 'updated', fields: ['title'] }); // status 未变不入
      expect(result.items[2].change).toEqual({ kind: 'unknown', fields: [] });
      // 仅字段名，不泄漏快照值（数据最小化口径保持）
      expect(JSON.stringify(result.items[0].change)).not.toContain('新事件');
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

  describe('G-3 副作用哈希链（side_effect 入链）', () => {
    function buildChained(over?: { find?: unknown; save?: unknown }) {
      const cRepo = {
        save: over?.save ?? jest.fn().mockResolvedValue({ id: 9, hash: 'h' }),
        find: over?.find ?? jest.fn(),
        findOne: jest.fn(),
        create: jest.fn((d: any) => d),
        createQueryBuilder: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue(null), // 无既有已哈希行 → genesis
        })),
      };
      const auditChain = {
        computeHash: jest.fn().mockReturnValue('chain-hash'),
        verifyChain: jest.fn().mockReturnValue({ valid: true, checked: 1 }),
      } as any;
      const s = new AiToolEffectsService(cRepo as any, undefined, undefined, undefined, auditChain);
      return { service: s, cRepo, auditChain };
    }

    it('record：无既有已哈希行 → 首行 genesis（prevHash null）+ 写 hash', async () => {
      const { service, cRepo } = buildChained();
      await service.record(
        { userId: '1', conversationId: 'c', toolName: 'create_event', args: { title: 'X' } },
        'event',
        42,
      );
      expect(cRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: expect.any(String), prevHash: null, hash: 'chain-hash' }),
      );
    });

    it('verifySideEffectChain：仅校验已哈希行（历史 null 行跳过），无 auditChain 时降级 valid', async () => {
      const hashedRows = [
        { id: 3, prevHash: null, hash: 'h3' },
        { id: 5, prevHash: 'h3', hash: 'h5' },
      ];
      const unhashed = [{ id: 1, prevHash: null, hash: null }, { id: 2, prevHash: null, hash: null }];
      const { service, auditChain } = buildChained({ find: jest.fn().mockResolvedValue([...unhashed, ...hashedRows]) });
      const res = await service.verifySideEffectChain();
      expect(res.valid).toBe(true);
      expect(res.hashed).toBe(2);
      expect(res.firstHashedId).toBe(3);
      // verifyChain 只收到已哈希行
      expect(auditChain.verifyChain).toHaveBeenCalledWith(hashedRows, expect.any(Function));
    });
  });

  describe('KB-6 revokeClass（撤销能力档位 + 状态归一）', () => {
    let svc: AiToolEffectsService;
    let registry: ToolRegistry;
    let revokerStub: {
      canHandle: jest.Mock;
      revoke: jest.Mock;
      describeTarget: jest.Mock;
    };

    // 直接 new（依赖全 @Optional；ToolRegistry 手动装；SIDE_EFFECT_REVOKER 用 stub）
    const makeService = (opts?: { withRevoker?: boolean }) => {
      revokerStub = {
        canHandle: jest.fn().mockReturnValue(opts?.withRevoker ? true : false),
        revoke: jest.fn().mockResolvedValue({ revoked: true }),
        describeTarget: jest.fn().mockResolvedValue({ deletedAt: null }),
      };
      const externalRevoker = {
        revoke: jest.fn().mockResolvedValue({ ok: true, message: 'compensated' }),
      };
      svc = new AiToolEffectsService(
        repo as never,
        opts?.withRevoker ? (revokerStub as never) : undefined,
        externalRevoker as never,
        undefined,
        undefined,
        registry as never,
      );
    };

    beforeEach(() => {
      registry = new ToolRegistry();
      registry.register({
        name: 'create_event',
        description: '创建事件',
        parameters: [],
        requiresConfirmation: true,
        toToolDefinition: () => ({ type: 'function' } as never),
        execute: async () => ({ success: true }),
      });
    });

    it('record：确认写工具（registry 命中）→ 落 revokeClass 快照 local_compensate', async () => {
      makeService();
      repo.save.mockImplementation((d: never) => Promise.resolve({ id: 1, ...(d as object) }));
      const saved = await svc.record(
        { userId: '1', conversationId: 'c', toolName: 'create_event', args: { title: 'X' } },
        'event',
        42,
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ revokeClass: 'local_compensate' }),
      );
      expect(saved.revokeClass).toBe('local_compensate');
    });

    it('record：未注册工具 + 无本地 revoker → revokeClass 快照 none', async () => {
      makeService();
      repo.save.mockImplementation((d: never) => Promise.resolve({ id: 1, ...(d as object) }));
      const saved = await svc.record(
        { userId: '1', toolName: 'external_write', args: { id: 1 } },
        'proxy_call',
        9,
      );
      expect(saved.revokeClass).toBe('none');
    });

    it('_doRevoke：revokeClass=none → 拒绝且不改列（none 门控，不误走 externalRevoker）', async () => {
      makeService();
      repo.findOne.mockResolvedValue({
        id: 7,
        toolName: 'ext_no_path',
        resultType: 'proxy_call',
        resultId: 9,
        userId: '1',
        revokeClass: 'none',
      });
      repo.update = jest.fn();
      const res = await svc.revoke(7);
      expect(res?.revoked).toBe(false);
      expect(res?.message).toMatch(/无撤销接口/);
      expect(repo.update).not.toHaveBeenCalled();
      expect(revokerStub.canHandle).not.toHaveBeenCalled();
    });

    it('_doRevoke：外部补偿 2xx → 回写 revoke_status=compensating（非 revoked，2xx≠确认回滚）', async () => {
      makeService();
      repo.findOne.mockResolvedValue({
        id: 8,
        toolName: 'java_ext',
        resultType: 'proxy_call',
        resultId: 10,
        userId: '1',
        revokeClass: 'governed_external',
      });
      repo.update = jest.fn().mockResolvedValue({ affected: 1 });
      const res = await svc.revoke(8);
      expect(res?.revoked).toBe(true);
      expect(res?.revokeStatus).toBe('compensating');
      expect(repo.update).toHaveBeenCalledWith(8, { revokeStatus: 'compensating' });
    });

    it('listOwned：proxy compensating 后 status=revoking_external（≠ revoked）', async () => {
      makeService();
      repo.findAndCount.mockResolvedValue([
        [
          {
            id: 8,
            toolName: 'java_ext',
            resultType: 'proxy_call',
            resultId: 10,
            userId: '1',
            revokeClass: 'governed_external',
            revokeStatus: 'compensating',
            createdAt: new Date(),
          },
        ],
        1,
      ]);
      revokerStub.describeTarget.mockResolvedValue({ deletedAt: null });
      const res = await svc.listOwned('1', { page: 1, limit: 20 });
      expect(res.items[0].status).toBe('revoking_external');
      expect(res.items[0].status).not.toBe('revoked');
      expect(res.items[0].revokeClass).toBe('governed_external');
    });

    it('listOwned：revocable = 服务端判定（executed+可撤档 true；none / revoking_external false）', async () => {
      makeService();
      repo.findAndCount.mockResolvedValue([
        [
          { id: 1, toolName: 'create_event', resultType: 'event', resultId: 11, userId: '1', revokeClass: 'local_compensate', createdAt: new Date() },
          { id: 2, toolName: 'ext', resultType: 'proxy_call', resultId: 9, userId: '1', revokeClass: 'none', createdAt: new Date() },
          { id: 3, toolName: 'java', resultType: 'proxy_call', resultId: 8, userId: '1', revokeClass: 'governed_external', revokeStatus: 'compensating', createdAt: new Date() },
        ],
        3,
      ]);
      revokerStub.describeTarget.mockResolvedValue({ deletedAt: null });
      const res = await svc.listOwned('1', { page: 1, limit: 50 });
      expect(res.items[0].revocable).toBe(true); // executed + local_compensate
      expect(res.items[1].revocable).toBe(false); // none
      expect(res.items[2].revocable).toBe(false); // revoking_external（补偿中，禁可撤）
    });

    it('resolveRevokeClass 派生：确认写→local_compensate、读→none、显式优先', () => {
      expect(resolveRevokeClass({ requiresConfirmation: true })).toBe('local_compensate');
      expect(resolveRevokeClass({ requiresConfirmation: false })).toBe('none');
      expect(resolveRevokeClass({ revokeClass: 'governed_external', requiresConfirmation: false })).toBe('governed_external');
    });
  });
});
