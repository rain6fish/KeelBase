// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { getRepositoryToken, getEntityManagerToken } from '@nestjs/typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { LocalEntityRevoker, SIDE_EFFECT_REVOKER } from './side-effect-revoker';
import { ToolRegistry } from '../tools/tool-registry';
import { resolveRevokeClass } from '../interfaces/tool.interface';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
      // resolveLocalEntity 对**无别名**的 resultType（生成模块 / pm_project 等）会扫实体元数据，
      // 故 mock 需带 connection.entityMetadatas（缺了会 TypeError，与产品逻辑无关）
      connection: { entityMetadatas: [] },
    } as { getRepository: jest.Mock };
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

  // A8: the pair resultType+resultId is not unique by itself for result types with no local entity,
  // so the lookup must be told who is asking and must answer deterministically. The previous
  // signature had neither, and `findOne` returned whichever row the driver happened to hand back.
  // These cases fail against it: no `userId` in the where clause, no `order`.
  //
  // A8：对无本地实体的 resultType，resultType+resultId 本身不唯一，故查询必须被告知「谁在问」，
  // 且答案必须确定。旧签名两者皆无，`findOne` 返回驱动随手给的那一行。下列用例对旧实现为红：
  // where 里没有 `userId`、也没有 `order`。
  describe('findByTarget（A8：按用户收窄 + 确定性）', () => {
    it('给了 viewerUserId → 只在该用户的行里取，且按 id 升序（确定性）', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.findByTarget('proxy_call', 7, '42');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { resultType: 'proxy_call', resultId: 7, userId: '42' },
        order: { id: 'ASC' },
      });
    });

    it('不给 viewerUserId（管理员 / 服务身份）→ 仍按业务动作查，但答案确定', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.findByTarget('crm_task', 42);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { resultType: 'crm_task', resultId: 42 },
        order: { id: 'ASC' },
      });
    });
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

  describe('recordGroup（复合写工具分组登记，docs/cascade-compensation.spec.md §4）', () => {
    const ctx = {
      userId: '42',
      conversationId: 'conv-9',
      toolName: 'create_project_with_tasks',
      args: { title: 'X' },
    };
    const group = [
      { resultType: 'pm_project', resultId: 7 },
      { resultType: 'pm_task', resultId: 88 },
      { resultType: 'pm_task', resultId: 89 },
    ];

    beforeEach(() => {
      let seq = 0;
      repo.save.mockImplementation((d: unknown) => Promise.resolve({ ...(d as object), id: ++seq }));
    });

    it('组内成员键互异、member0 占基键（同键会被唯一约束把整组塌成一行）', async () => {
      const saved = await service.recordGroup(ctx, group);
      const base = AiToolEffectsService.buildKey(ctx);
      const keys = saved.map((s) => s.idempotencyKey);
      expect(new Set(keys).size).toBe(3);
      expect(keys[0]).toBe(base);
      expect(keys.slice(1)).toEqual([
        AiToolEffectsService.memberKey(base, 1, 'pm_task', 88),
        AiToolEffectsService.memberKey(base, 2, 'pm_task', 89),
      ]);
    });

    it('同组：全员共享 compensationGroup = 基键；parentEffectId 指向根（根为 null）', async () => {
      const saved = await service.recordGroup(ctx, group);
      const base = AiToolEffectsService.buildKey(ctx);
      expect(saved.map((s) => s.compensationGroup)).toEqual([base, base, base]);
      expect(saved.map((s) => s.parentEffectId)).toEqual([null, 1, 1]);
      expect(saved.map((s) => s.resultType)).toEqual(['pm_project', 'pm_task', 'pm_task']);
      expect(saved.map((s) => s.resultId)).toEqual([7, 88, 89]);
    });

    it('memberKey 按声明下标稳定（重试映射同一键），下标不同则不同', () => {
      const base = 'b';
      expect(AiToolEffectsService.memberKey(base, 1, 'pm_task', 88)).toBe(
        AiToolEffectsService.memberKey(base, 1, 'pm_task', 88),
      );
      expect(AiToolEffectsService.memberKey(base, 1, 'pm_task', 88)).not.toBe(
        AiToolEffectsService.memberKey(base, 2, 'pm_task', 88),
      );
      // 同下标但目标不同 → 不同键（同工具重复写同一张表的多个子行才可能撞键）
      expect(AiToolEffectsService.memberKey(base, 1, 'pm_task', 88)).not.toBe(
        AiToolEffectsService.memberKey(base, 1, 'pm_task', 89),
      );
    });

    it('唯一冲突 → 回放既有整组（幂等重试），不上抛', async () => {
      const base = AiToolEffectsService.buildKey(ctx);
      const existing = [
        { id: 1, idempotencyKey: base, compensationGroup: base, resultType: 'pm_project', resultId: 7 },
        { id: 2, idempotencyKey: 'x', compensationGroup: base, resultType: 'pm_task', resultId: 88 },
        { id: 3, idempotencyKey: 'y', compensationGroup: base, resultType: 'pm_task', resultId: 89 },
      ];
      repo.save.mockRejectedValue(
        new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: ai_tool_side_effects.idempotency_key'),
      );
      repo.find.mockResolvedValue(existing);

      const saved = await service.recordGroup(ctx, group);
      expect(saved).toEqual(existing);
      // 回放走的是组查询（按 compensationGroup），不是单条 findOne
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { compensationGroup: base } }),
      );
    });

    it('非唯一冲突（DB down 等）→ 照实上抛，不伪装幂等命中', async () => {
      repo.save.mockRejectedValue(new Error('connection terminated unexpectedly'));
      await expect(service.recordGroup(ctx, group)).rejects.toThrow(/connection terminated/);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('（回归）整组登记落在**一个事务**内——「杜绝半组」不再是注释', async () => {
      // 原先 sqlite 分支只做 promise 串行、不包裹事务 → 组内中途失败会留下**半组**（前几条已提交），
      // 与 recordGroup 的契约相反。现在整段走 dataSource.transaction，故断言：恰好一次事务，
      // 且三行都落在**同一个事务 manager** 上（跑在默认 repo 上就等于跑在事务外）。
      const txRepo = {
        create: jest.fn((x: unknown) => x),
        save: jest.fn((d: unknown) => Promise.resolve({ ...(d as object), id: 1 })),
      };
      const manager = { getRepository: jest.fn(() => txRepo) };
      const tx = jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager));
      const svc = new AiToolEffectsService(
        repo as never,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { options: { type: 'better-sqlite3' }, transaction: tx } as never,
        undefined,
      );

      const saved = await svc.recordGroup(ctx, group);

      expect(tx).toHaveBeenCalledTimes(1);
      expect(manager.getRepository).toHaveBeenCalledTimes(3);
      expect(txRepo.save).toHaveBeenCalledTimes(3);
      expect(saved).toHaveLength(3);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('（回归）无 dataSource（单测/降级装配）时仍能登记——不因事务缺席而失败', async () => {
      // dataSource 是 @Optional：缺失时应退回原行为（进程内串行、无事务），而不是抛错。
      const saved = await service.recordGroup(ctx, group);
      expect(saved).toHaveLength(3);
      expect(repo.save).toHaveBeenCalledTimes(3);
    });
  });

  describe('revoke', () => {
    it('软删目标 todo', async () => {
      repo.findOne.mockResolvedValue({ id: 3, resultType: 'todo', resultId: 55 });
      const todoRepo = { findOne: jest.fn().mockResolvedValue({ id: 55 }), softDelete: jest.fn() };
      entityManager.getRepository.mockReturnValue(todoRepo);

      const res = await service.revoke(3);
      expect(res).toMatchObject({ revoked: true, effectId: 3 });
      // ② 绑定：撤销结果键集 ⊆ side-effect-revoke.revokeResult 冻结契约（无越界键）
      const props = Object.keys(
        (
          JSON.parse(
            readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v3/side-effect-revoke.schema.json'), 'utf8'),
          ) as { definitions: { revokeResult: { properties: Record<string, unknown> } } }
        ).definitions.revokeResult.properties,
      );
      expect(Object.keys(res as object).filter((k) => !props.includes(k))).toEqual([]);
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

    // 回归：此前只钳上界，`?limit=0` → take=0 → totalPages=ceil(total/0)=Infinity（JSON 序列化成 null）。
    // 下界与 listOwned 对齐。 / Regression: only the upper bound was clamped, so `?limit=0` made
    // totalPages Infinity (serialised as null); the lower bound now matches listOwned.
    it('limit 钳制下界 1（防 ?limit=0 → totalPages=Infinity）', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
      const result = await service.list({ limit: 0 });
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
      expect(Number.isFinite(result.totalPages)).toBe(true);
    });
  });

  /**
   * REV-2：`compensating` 的年龄与陈旧标记。
   * 在此之前该状态没有任何时间信息 —— 「当前未了结」里上个月卡住的行与五分钟前刚请求的行读数完全相同。
   * 这里钉住的是「陈旧会被标出」，以及**不得**因年龄把状态改写成成功或失败。
   */
  describe('list：REV-2 陈旧 compensating 标记', () => {
    const compensatingEffect = (id: number, requestedAt: Date | null) => ({
      id,
      userId: '1',
      toolName: 'proxy_call',
      conversationId: 'c',
      resultType: 'external_call',
      resultId: id,
      argsHash: 'h',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      revokeStatus: 'compensating',
      revokeClass: 'governed_external',
      revokeRequestedAt: requestedAt,
    });

    beforeEach(() => {
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    });

    it('请求时刻远超阈值 → revokeStale=true 且给出年龄，且状态**不被改写**', async () => {
      const twoHoursAgo = new Date(Date.now() - 120 * 60_000);
      repo.findAndCount.mockResolvedValue([[compensatingEffect(1, twoHoursAgo)], 1]);

      const result = await service.list({});

      expect(result.items[0]).toMatchObject({
        revokePending: true,
        revokeStale: true,
        // 只标出「挂了多久」，绝不据此改成成功/失败
        revokeStatus: 'compensating',
      });
      expect(result.items[0].revokeAgeMinutes).toBeGreaterThanOrEqual(120);
      expect(result.items[0].revokeRequestedAt).toBe(twoHoursAgo.toISOString());
    });

    it('刚请求（阈值内）→ revokeStale=false，仍为 pending', async () => {
      repo.findAndCount.mockResolvedValue([[compensatingEffect(2, new Date())], 1]);

      const result = await service.list({});

      expect(result.items[0]).toMatchObject({ revokePending: true, revokeStale: false });
      expect(result.items[0].revokeAgeMinutes).toBe(0);
    });

    it('引入本列之前写入的行（请求时刻为 NULL）→ pending 但年龄未知，**不判陈旧**', async () => {
      repo.findAndCount.mockResolvedValue([[compensatingEffect(3, null)], 1]);

      const result = await service.list({});

      expect(result.items[0]).toMatchObject({
        revokePending: true,
        revokeAgeMinutes: null,
        revokeStale: false,
        revokeRequestedAt: null,
      });
    });

    it('stale=true → 库侧按 compensating + 请求时刻早于阈值过滤（NULL 行天然不匹配）', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.list({ stale: true });

      const where = repo.findAndCount.mock.calls[0][0].where;
      expect(where.revokeStatus).toBe('compensating');
      expect(where.revokeRequestedAt).toBeDefined();
    });

    it('非 compensating 行不带年龄（revoked 之后没有「挂了多久」可言）', async () => {
      repo.findAndCount.mockResolvedValue([
        [{ ...compensatingEffect(4, new Date('2026-01-01T00:00:00Z')), revokeStatus: 'revoked' }],
        1,
      ]);

      const result = await service.list({});

      expect(result.items[0]).toMatchObject({
        revokePending: false,
        revokeAgeMinutes: null,
        revokeStale: false,
      });
    });
  });

  /**
   * REV-1 + REV-2 细化：管理端读侧必须看得见「争议」与「两个窗口」。
   * 标记只活在库里、操作员无从发现，等于没检出 —— 这一块钉的就是「读得出来」。
   */
  describe('list：REV-1 争议标记 + REV-2 窗口读数', () => {
    const evidence = {
      declared: [
        { resultType: 'pm_project', resultId: 7 },
        { resultType: 'pm_task', resultId: 88 },
      ],
      stored: [{ resultType: 'pm_project', resultId: 7 }],
      onlyDeclared: [{ resultType: 'pm_task', resultId: 88 }],
      onlyStored: [],
      decidedAt: '2026-09-24T10:00:00.000Z',
    };
    const row = (over: Record<string, unknown> = {}) => ({
      id: 1,
      userId: '1',
      toolName: 'proxy_call',
      conversationId: 'c',
      resultType: 'proxy_call',
      resultId: 9,
      argsHash: 'h',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      ...over,
    });

    beforeEach(() => {
      entityManager.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    });

    it('争议行 → disputed:true 且证据可读（被拒声明 + 双向差集）', async () => {
      repo.findAndCount.mockResolvedValue([
        [row({ compensationGroup: 'g', revokeDispute: JSON.stringify(evidence) })],
        1,
      ]);

      const result = await service.list({});

      expect(result.items[0].disputed).toBe(true);
      expect(result.items[0].dispute).toEqual(evidence);
    });

    it('无争议行 → disputed:false、dispute:null（不制造噪音字段值）', async () => {
      repo.findAndCount.mockResolvedValue([[row({ compensationGroup: 'g' })], 1]);

      const result = await service.list({});

      expect(result.items[0].disputed).toBe(false);
      expect(result.items[0].dispute).toBeNull();
    });

    it('证据列坏掉（非 JSON）→ 仍标 disputed，但整页不 500', async () => {
      repo.findAndCount.mockResolvedValue([[row({ revokeDispute: 'not-json' })], 1]);

      const result = await service.list({});

      expect(result.items[0].disputed).toBe(true);
      expect(result.items[0].dispute).toBeNull();
    });

    it('compensating 的两种窗口可区分：有确认 = 确实到达，无确认 = 可能未到达', async () => {
      const ack = new Date('2026-09-24T09:00:00Z');
      repo.findAndCount.mockResolvedValue([
        [
          row({ id: 1, revokeStatus: 'compensating', revokeRequestedAt: ack, revokeAcknowledgedAt: ack }),
          row({ id: 2, revokeStatus: 'compensating', revokeRequestedAt: ack }),
          row({ id: 3, revokeStatus: 'revoked', revokeAcknowledgedAt: ack }),
        ],
        3,
      ]);

      const result = await service.list({});

      expect(result.items[0]).toMatchObject({
        revokeWindow: 'awaiting_target',
        revokeAcknowledgedAt: ack.toISOString(),
      });
      expect(result.items[1]).toMatchObject({
        revokeWindow: 'unacknowledged',
        revokeAcknowledgedAt: null,
      });
      // 已了结（revoked）不谈窗口，确认时刻仍如实回显
      expect(result.items[2].revokeWindow).toBeNull();
      expect(result.items[2].revokeAcknowledgedAt).toBe(ack.toISOString());
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
      // ② 绑定：Action Center item 键集 == side-effect-revoke.item 契约（v3，含 change + 级联组两键）
      const defs = (
        JSON.parse(
          readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v3/side-effect-revoke.schema.json'), 'utf8'),
        ) as { definitions: { item: { properties: Record<string, unknown> } } }
      ).definitions;
      expect(Object.keys(result.items[0]).sort()).toEqual(Object.keys(defs.item.properties).sort());
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
      // ② 绑定：执行轨迹 traceItem 键集 == side-effect-revoke.traceItem 契约（v2，含 argsHash + 快照）
      const defsT = (
        JSON.parse(
          readFileSync(resolve(__dirname, '../../../specs/protocol/schemas/v3/side-effect-revoke.schema.json'), 'utf8'),
        ) as { definitions: { traceItem: { properties: Record<string, unknown> } } }
      ).definitions;
      expect(Object.keys(items[0]).sort()).toEqual(Object.keys(defsT.traceItem.properties).sort());
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

    it('并发 record 串行化：链不分叉（每行 prevHash = 前一行 hash）', async () => {
      // 有状态 fake repo：save 入库、lastHash 读库末行——模拟真实持久化，才能暴露 read-modify-write 竞态
      const rows: Array<{ id: number; hash: string | null; prevHash: string | null; idempotencyKey: string }> = [];
      const cRepo = {
        create: (d: any) => d,
        save: jest.fn(async (d: any) => {
          const row = { ...d, id: rows.length + 1 };
          rows.push(row);
          return row;
        }),
        findOne: jest.fn(),
        createQueryBuilder: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getRawOne: jest.fn(async () => (rows.length ? { hash: rows[rows.length - 1].hash } : null)),
        })),
      };
      const auditChain = {
        computeHash: (prev: string | null, payload: any) => `${prev ?? 'genesis'}|${payload.idempotencyKey}`,
      } as any;
      const s = new AiToolEffectsService(cRepo as any, undefined, undefined, undefined, auditChain);

      // 5 个并发写（args 不同 → idempotencyKey 不同，不会幂等合并）
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          s.record({ userId: '1', conversationId: 'c', toolName: 'create_event', args: { i } }, 'event', i + 1),
        ),
      );

      expect(rows).toHaveLength(5);
      expect(rows[0].prevHash).toBeNull(); // genesis
      for (let i = 1; i < rows.length; i++) {
        // 无串行化时 5 个并发全读到 null → 全部 prevHash null → 此处必失败（链分叉）
        expect(rows[i].prevHash).toBe(rows[i - 1].hash);
      }
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

  describe('级联补偿（docs/cascade-compensation.spec.md §5）', () => {
    const G = 'grp-1';
    const fx = (
      id: number,
      resultType: string,
      resultId: number,
      extra: Record<string, unknown> = {},
    ) => ({
      id,
      userId: '42',
      toolName: 'create_project_with_tasks',
      resultType,
      resultId,
      revokeClass: 'local_compensate',
      revokeStatus: null,
      compensationGroup: G,
      parentEffectId: id === 1 ? null : 1,
      ...extra,
    });

    let svc: AiToolEffectsService;
    let revokerStub: { canHandle: jest.Mock; revoke: jest.Mock; describeTarget: jest.Mock };
    let extStub: { revoke: jest.Mock };
    let auditStub: { log: jest.Mock };
    let tx: jest.Mock;
    const MANAGER = { id: 'TX_MANAGER' };

    const makeService = (withDataSource = true) => {
      revokerStub = {
        canHandle: jest.fn().mockReturnValue(true),
        revoke: jest.fn().mockResolvedValue({ revoked: true }),
        // ARC-1：本地软删语义下，`revoked` 的行**目标是软的**——夹具此前一律给 `deletedAt: null`
        // （永远「活着」），那是把「已撤销」当跳过态用的**代称**，没有建模这对真实配对。
        describeTarget: jest.fn().mockResolvedValue({ deletedAt: new Date('2026-01-01T00:00:00Z') }),
      };
      extStub = { revoke: jest.fn().mockResolvedValue({ ok: true, message: 'compensated' }) };
      auditStub = { log: jest.fn().mockResolvedValue(undefined) };
      tx = jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(MANAGER));
      svc = new AiToolEffectsService(
        repo as never,
        revokerStub as never,
        extStub as never,
        undefined,
        undefined,
        undefined,
        withDataSource ? ({ options: { type: 'better-sqlite3' }, transaction: tx } as never) : undefined,
        auditStub as never,
      );
    };

    it('撤组内任一条 → 整组一个事务补偿，三条全软删且状态回写 revoked', async () => {
      makeService();
      const members = [fx(1, 'pm_project', 7), fx(2, 'pm_task', 88), fx(3, 'pm_task', 89)];
      repo.findOne.mockResolvedValue(members[1]); // 撤组内第 2 条
      repo.find.mockResolvedValue(members);
      repo.update.mockResolvedValue({ affected: 1 });

      const res = await svc.revoke(2);

      expect(tx).toHaveBeenCalledTimes(1); // 一次补偿 ≠ N 次逐条提交
      expect(revokerStub.revoke).toHaveBeenCalledTimes(3);
      // 三条都落在**同一个**事务 manager 上（否则回滚覆盖不到它们）
      expect(revokerStub.revoke.mock.calls.map((c) => c[3])).toEqual([MANAGER, MANAGER, MANAGER]);
      expect(revokerStub.revoke.mock.calls.map((c) => [c[0], c[1]])).toEqual([
        ['pm_project', 7],
        ['pm_task', 88],
        ['pm_task', 89],
      ]);
      expect(res.revoked).toBe(true);
      expect(res.revokeStatus).toBe('revoked');
      expect(res.compensationGroup).toBe(G);
      expect(res.cascade).toEqual({ groupId: G, total: 3, revoked: 3, skipped: 0, failed: 0 });
      expect(repo.update).toHaveBeenCalledTimes(3);
    });

    it('组内任一本地成员失败 → 整组零改动：不写 revoked、不触发外部补偿', async () => {
      makeService();
      const members = [fx(1, 'pm_project', 7), fx(2, 'pm_task', 88), fx(3, 'pm_task', 89)];
      repo.findOne.mockResolvedValue(members[0]);
      repo.find.mockResolvedValue(members);
      revokerStub.revoke.mockImplementation((_t: string, id: number) =>
        Promise.resolve(id === 88 ? { revoked: false, message: '目标不可软删' } : { revoked: true }),
      );

      const res = await svc.revoke(1);

      expect(res.revoked).toBe(false);
      expect(res.revokeStatus).toBe('revoke_failed');
      expect(res.cascade).toEqual({ groupId: G, total: 3, revoked: 0, skipped: 0, failed: 3 });
      // 关键：**没有**任何回写——否则回滚后数据库里会留下假的 revoked 运维态
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('本地回滚时不触发外部成员补偿（避免半补偿）', async () => {
      makeService();
      const members = [
        fx(1, 'pm_project', 7),
        fx(2, 'proxy_call', 88, { revokeClass: 'governed_external' }),
      ];
      repo.findOne.mockResolvedValue(members[0]);
      repo.find.mockResolvedValue(members);
      revokerStub.revoke.mockResolvedValue({ revoked: false, message: 'boom' });

      const res = await svc.revoke(1);

      expect(extStub.revoke).not.toHaveBeenCalled();
      expect(res.revokeStatus).toBe('revoke_failed');
    });

    it('组内外部成员：本地事务提交后于事务外补偿，诚实落 compensating 且不谎称已撤销', async () => {
      makeService();
      const members = [
        fx(1, 'pm_project', 7),
        fx(2, 'proxy_call', 88, { revokeClass: 'governed_external' }),
      ];
      repo.findOne.mockResolvedValue(members[0]);
      repo.find.mockResolvedValue(members);
      repo.update.mockResolvedValue({ affected: 1 });

      const res = await svc.revoke(1);

      expect(extStub.revoke).toHaveBeenCalledTimes(1);
      // 逐条 revoked = 「撤销调用成功」（既有口径），只有 revokeStatus 承载诚实状态
      expect(res.cascade).toEqual({ groupId: G, total: 2, revoked: 2, skipped: 0, failed: 0 });
      // 但组级结论不得谎称已撤销：外部结果未知 → revoked:false + compensating（KB-6 口径）
      expect(res.revoked).toBe(false);
      expect(res.revokeStatus).toBe('compensating');
    });

    it('单成员组 → 回落单目标路径，不建事务', async () => {
      makeService();
      const only = fx(1, 'pm_project', 7);
      repo.findOne.mockResolvedValue(only);
      repo.find.mockResolvedValue([only]);
      repo.update.mockResolvedValue({ affected: 1 });

      const res = await svc.revoke(1);

      expect(tx).not.toHaveBeenCalled();
      expect(res.cascade).toBeUndefined();
      expect(revokerStub.revoke).toHaveBeenCalledTimes(1);
    });

    it('无组的副作用（历史行）→ 单目标路径，行为不变', async () => {
      makeService();
      const legacy = fx(1, 'pm_project', 7, { compensationGroup: null });
      repo.findOne.mockResolvedValue(legacy);

      const res = await svc.revoke(1);

      expect(repo.find).not.toHaveBeenCalled(); // 不查组
      expect(tx).not.toHaveBeenCalled();
      expect(res.compensationGroup).toBeUndefined();
      expect(res.revoked).toBe(true);
    });

    it('批量（run 级）按组折叠：同组只补偿一次，逐条结果摊平', async () => {
      makeService();
      const members = [fx(1, 'pm_project', 7), fx(2, 'pm_task', 88), fx(3, 'pm_task', 89)];
      repo.find.mockResolvedValue(members); // revokeRun 的按 runId 查询与 listGroup 共用同一 mock
      repo.update.mockResolvedValue({ affected: 1 });

      const res = await svc.revokeRun('run-1');

      expect(tx).toHaveBeenCalledTimes(1); // 折叠生效：不是 3 次
      expect(revokerStub.revoke).toHaveBeenCalledTimes(3);
      expect(res.results).toHaveLength(3);
      expect(res.revoked).toBe(3);
      expect(res.failed).toBe(0);
      expect(res.results.every((r) => r.compensationGroup === G)).toBe(true);
    });

    it('批量折叠：首个成员已是可跳过态时整组仍被补偿（不得提前 continue）', async () => {
      makeService();
      const members = [
        fx(1, 'pm_project', 7, { revokeStatus: 'revoked' }), // 已撤销 → 可跳过
        fx(2, 'pm_task', 88),
        fx(3, 'pm_task', 89),
      ];
      repo.find.mockResolvedValue(members);
      repo.update.mockResolvedValue({ affected: 1 });

      const res = await svc.revokeRun('run-1');

      expect(tx).toHaveBeenCalledTimes(1);
      expect(res.skipped).toBe(1);
      expect(res.revoked).toBe(2); // 另两条确实被补偿了
    });

    it('补偿自身入 operation_audit：action=COMPENSATE、targetId=根业务 id、逐成员明细进链外 changes', async () => {
      makeService();
      const members = [fx(1, 'pm_project', 7), fx(2, 'pm_task', 88), fx(3, 'pm_task', 89)];
      repo.findOne.mockResolvedValue(members[1]);
      repo.find.mockResolvedValue(members);
      repo.update.mockResolvedValue({ affected: 1 });

      await svc.revoke(2);

      expect(auditStub.log).toHaveBeenCalledTimes(1);
      const entry = auditStub.log.mock.calls[0][0] as Record<string, unknown>;
      expect(entry).toMatchObject({
        action: 'COMPENSATE',
        method: 'DELETE',
        path: '/ai/tool-effects/compensate',
        targetId: '7', // 根成员 pm_project#7 的**业务 id**（非副作用 id）→ 证据根可按业务对象捞到
        featureKey: 'ai.compensate',
        businessEvent: 'AiSideEffectCompensated',
        userId: 42,
      });
      expect(JSON.parse(entry.changes as string)).toEqual([
        { resultType: 'pm_project', resultId: 7, role: 'root', revoked: true, revokeStatus: 'revoked' },
        { resultType: 'pm_task', resultId: 88, role: 'child', revoked: true, revokeStatus: 'revoked' },
        { resultType: 'pm_task', resultId: 89, role: 'child', revoked: true, revokeStatus: 'revoked' },
      ]);
    });

    it('补偿失败也留痕（审计要看见「尝试过且失败」，而不是一片空白）', async () => {
      makeService();
      const members = [fx(1, 'pm_project', 7), fx(2, 'pm_task', 88)];
      repo.findOne.mockResolvedValue(members[0]);
      repo.find.mockResolvedValue(members);
      revokerStub.revoke.mockResolvedValue({ revoked: false, message: 'boom' });

      await svc.revoke(1);

      expect(auditStub.log).toHaveBeenCalledTimes(1);
      const entry = auditStub.log.mock.calls[0][0] as { changes: string };
      expect(JSON.parse(entry.changes).every((d: { revoked: boolean }) => !d.revoked)).toBe(true);
    });

    it('单目标撤销**不**写显式补偿行（拦截器已有 HTTP 级行，再写只是噪音）', async () => {
      makeService();
      const legacy = fx(1, 'pm_project', 7, { compensationGroup: null });
      repo.findOne.mockResolvedValue(legacy);
      repo.update.mockResolvedValue({ affected: 1 });

      await svc.revoke(1);

      expect(auditStub.log).not.toHaveBeenCalled();
    });

    it('逐成员明细超 4000 时截断（changes 是 ≤4000 的链外列）', async () => {
      makeService();
      const many = Array.from({ length: 60 }, (_, i) =>
        fx(i + 1, `gen_module_with_a_long_name_${i}`, 1000 + i),
      );
      repo.findOne.mockResolvedValue(many[0]);
      repo.find.mockResolvedValue(many);
      repo.update.mockResolvedValue({ affected: 1 });

      await svc.revoke(1);

      const entry = auditStub.log.mock.calls[0][0] as { changes: string };
      expect(entry.changes.length).toBeLessThanOrEqual(4000);
      expect(entry.changes.endsWith('...')).toBe(true);
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
      // REV-2：进入 compensating 时一并记下补偿请求时刻（否则该状态没有年龄，「挂了多久」不可查）
      // REV-2 细化：意图写在外呼**之前**（revokeAcknowledgedAt 一并清空），确认是外呼返回后的**独立**事件。
      expect(repo.update).toHaveBeenNthCalledWith(1, 8, {
        revokeStatus: 'compensating',
        revokeRequestedAt: expect.any(Date),
        revokeAcknowledgedAt: null,
      });
      expect(repo.update).toHaveBeenNthCalledWith(2, 8, {
        revokeStatus: 'compensating',
        revokeAcknowledgedAt: expect.any(Date),
      });
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
