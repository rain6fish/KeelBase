// SPDX-License-Identifier: Apache-2.0

/**
 * Trust 沙盘（TrustSandboxService）单元测试
 *
 * 覆盖六场景的确定性返回结构：s1 正常分析 / s2 越权拒绝 / s3 R5 阻断 /
 * s4 确认门控 / s5 撤销 / s6 Java 引导 / 未知场景。
 */

import { ForbiddenException } from '@nestjs/common';
import { TrustSandboxService } from './trust-sandbox.service';

describe('TrustSandboxService', () => {
  let sandbox: TrustSandboxService;
  let aiService: {
    chat: jest.Mock;
    executeToolForExternal: jest.Mock;
  };
  let crmService: {
    createCustomer: jest.Mock;
    createOrder: jest.Mock;
    getCustomer360Data: jest.Mock;
    listCustomers: jest.Mock;
    removeCustomer: jest.Mock;
  };
  let usersService: { create: jest.Mock; remove: jest.Mock };
  let effectsService: {
    listOwned: jest.Mock;
    revokeOwned: jest.Mock;
  };
  let usersRepo: { createQueryBuilder: jest.Mock };
  let abilityFactory: { createForUser: jest.Mock };
  let settingsService: { getWithDefault: jest.Mock; set: jest.Mock };
  let statsStore: string;

  beforeEach(() => {
    statsStore = '{}';
    settingsService = {
      getWithDefault: jest.fn(async () => statsStore),
      set: jest.fn(async (_k: string, v: unknown) => {
        statsStore = String(v);
        return {};
      }),
    };
  });

  beforeEach(() => {
    aiService = {
      chat: jest.fn(),
      executeToolForExternal: jest.fn(),
    };
    crmService = {
      createCustomer: jest.fn(),
      createOrder: jest.fn(),
      getCustomer360Data: jest.fn(),
      listCustomers: jest.fn(),
      removeCustomer: jest.fn(),
    };
    usersService = { create: jest.fn(), remove: jest.fn() };
    effectsService = {
      listOwned: jest.fn(),
      revokeOwned: jest.fn(),
    };
    const qb: { where: jest.Mock; andWhere: jest.Mock; getMany: jest.Mock } = {
      where: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn(),
    };
    qb.where.mockReturnValue(qb);
    qb.andWhere.mockReturnValue(qb);
    qb.getMany.mockResolvedValue([]);
    usersRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    abilityFactory = { createForUser: jest.fn().mockReturnValue({}) };
    sandbox = new TrustSandboxService(
      aiService as never,
      crmService as never,
      usersService as never,
      effectsService as never,
      usersRepo as never,
      abilityFactory as never,
      settingsService as never,
    );
  });

  it('scenarios 暴露六场景清单', () => {
    expect(sandbox.scenarios.map((s) => s.id)).toEqual([
      's1_normal', 's2_denied', 's3_r5_block', 's4_confirm', 's5_revoke', 's6_java',
    ]);
  });

  it('P0-2 journey：Ask→人工确认→越权拒绝→高风险阻断 四步编排', async () => {
    crmService.createCustomer.mockResolvedValue({ id: 9, name: '沙盘客户' });
    crmService.createOrder.mockResolvedValue({});
    aiService.chat.mockImplementation((_u: string, opts: { message: string }) =>
      opts.message.includes('删除')
        ? Promise.resolve({ conversationId: 'conv-3', reply: 'Tool "delete_customer" is blocked (risk level R5)' })
        : Promise.resolve({ conversationId: 'conv-1', reply: '风险等级：critical（评分 12）' }),
    );
    aiService.executeToolForExternal.mockResolvedValue({ executed: false, requiresConfirmation: true });
    usersService.create.mockResolvedValue({ id: 77 });
    crmService.getCustomer360Data.mockRejectedValue(new ForbiddenException('无权访问此客户'));

    const j = await sandbox.journey('42');
    expect(j.journey).toBe('trust');
    expect(j.steps.map((s) => s.step)).toEqual(['ask', 'act', 'break_deny', 'break_block']);
    expect(j.steps.map((s) => s.scenario)).toEqual(['s1_normal', 's4_confirm', 's2_denied', 's3_r5_block']);
    expect(j.steps.every((s) => s.outcome === 'passed')).toBe(true);
    expect(j.steps[0].conversationId).toBe('conv-1'); // ask 留痕供「打开执行轨迹」
    expect(j.steps[1].requiresConfirmation).toBe(true);
    expect(j.steps[3].conversationId).toBe('conv-3');
  });

  it('P0-2 ④ cleanup：删沙盘合成客户 + bob 演示账号，跳过含真实子行的客户', async () => {
    crmService.listCustomers.mockImplementation(async (_uid: number, filter: { keyword?: string }) => {
      const rows =
        filter.keyword === '沙盘客户'
          ? [{ id: 10, name: '沙盘客户123' }]
          : [{ id: 11, name: '越权目标55' }];
      return { items: rows, total: rows.length };
    });
    crmService.getCustomer360Data.mockImplementation(async (id: number) =>
      id === 10
        ? { tasks: [], activities: [], opportunities: [], contacts: [], risks: [] }
        : { tasks: [{ id: 1 }], activities: [], opportunities: [], contacts: [], risks: [] },
    );
    crmService.removeCustomer.mockResolvedValue(undefined);
    const qb = usersRepo.createQueryBuilder() as unknown as {
      where: jest.Mock;
      andWhere: jest.Mock;
      getMany: jest.Mock;
    };
    qb.getMany.mockResolvedValue([{ id: 77, role: 'user' }]);
    usersService.remove.mockResolvedValue(undefined);

    const r = await sandbox.cleanup('42', true);

    // 沙盘客户123 无真实子行 → 删除；越权目标55 有 tasks → 跳过；bob(77) 删除
    expect(r.removedCustomers).toEqual(['沙盘客户123']);
    expect(r.skippedCustomers).toEqual(['越权目标55']);
    expect(r.removedBobUsers).toBe(1);
    expect(crmService.removeCustomer).toHaveBeenCalledTimes(1);
    expect(usersService.remove).toHaveBeenCalledWith(77);
    expect(abilityFactory.createForUser).toHaveBeenCalled();
    // admin 清全量 bob_sandbox_%
    expect(qb.where).toHaveBeenCalledWith('u.username LIKE :p', { p: 'bob_sandbox_%' });
  });

  it('P0-2 ④ cleanup：非 admin 只删本人归属前缀 bob_sandbox_<uid>_%；本人 id 跳过', async () => {
    crmService.listCustomers.mockResolvedValue({ items: [], total: 0 });
    const qb = usersRepo.createQueryBuilder() as unknown as {
      where: jest.Mock;
      andWhere: jest.Mock;
      getMany: jest.Mock;
    };
    qb.getMany.mockResolvedValue([
      { id: 42, role: 'user', username: 'bob_sandbox_42_x' },
      { id: 43, role: 'user', username: 'bob_sandbox_42_y' },
    ]);
    usersService.remove.mockResolvedValue(undefined);

    const r = await sandbox.cleanup('42', false);
    expect(r.removedCustomers).toEqual([]);
    expect(r.removedBobUsers).toBe(1); // 43 删，42 本人跳过
    expect(usersService.remove).toHaveBeenCalledWith(43);
    expect(usersService.remove).not.toHaveBeenCalledWith(42);
    // 非 admin 查询前缀限定本人归属，杜绝跨用户删号（bob_sandbox_43_* 等不被命中）
    expect(qb.where).toHaveBeenCalledWith('u.username LIKE :p', { p: 'bob_sandbox_42_%' });
  });

  it('P2 ③ recordJourneyCompleted / journeyStats：今日完成 +1、累计递增（跨访客聚合）', async () => {
    await sandbox.recordJourneyCompleted();
    await sandbox.recordJourneyCompleted();
    const s = await sandbox.journeyStats();
    expect(s.total).toBe(2);
    expect(s.today).toBe(2);
    expect(s.todayDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(settingsService.set).toHaveBeenCalledTimes(2);
  });

  it('s1_normal：建客户+逾期订单 → AI 风险分析 critical → passed + conversationId', async () => {
    crmService.createCustomer.mockResolvedValue({ id: 9, name: '沙盘客户123' });
    crmService.createOrder.mockResolvedValue({});
    aiService.chat.mockResolvedValue({
      conversationId: 'conv-1',
      reply: '风险分析完成：风险等级：critical（评分 12）…',
    });
    const r = await sandbox.run('s1_normal', '42');
    expect(r.outcome).toBe('passed');
    expect(r.conversationId).toBe('conv-1');
    expect(r.resultType).toBe('crm_customer');
    // 确定性演示直建客户无 AI 副作用 → governed:false（不展示会 404 的「业务动作治理详情」）
    expect(r.governed).toBe(false);
    expect(crmService.createOrder).toHaveBeenCalledTimes(2);
  });

  it('s2_denied：bob 越权读当前用户客户被拒 → denied', async () => {
    crmService.createCustomer.mockResolvedValue({ id: 9, name: '越权目标' });
    usersService.create.mockResolvedValue({ id: 77 });
    crmService.getCustomer360Data.mockRejectedValue(new ForbiddenException('无权访问此客户'));
    const r = await sandbox.run('s2_denied', '42');
    expect(r.outcome).toBe('passed');
    expect(String(r.detail)).toContain('被拒');
    expect(usersService.create).toHaveBeenCalled();
  });

  it('s3_r5_block：AI 尝试删除客户 → R5 阻断文本 → passed', async () => {
    aiService.chat.mockResolvedValue({
      conversationId: 'conv-3',
      reply: '已执行 delete_customer：{"success":false,"error":"Tool \\"delete_customer\\" is blocked (risk level R5)"}',
    });
    const r = await sandbox.run('s3_r5_block', '42');
    expect(r.outcome).toBe('passed');
    expect(r.conversationId).toBe('conv-3');
  });

  it('s4_confirm：写工具确认门控触发 → passed', async () => {
    aiService.executeToolForExternal.mockResolvedValue({ executed: false, requiresConfirmation: true });
    const r = await sandbox.run('s4_confirm', '42');
    expect(r.outcome).toBe('passed');
    expect(r.requiresConfirmation).toBe(true);
  });

  it('s5_revoke：本人有可撤销副作用 → 撤销 passed；无则 guide', async () => {
    effectsService.listOwned.mockResolvedValue({ items: [{ id: 5, resultType: 'crm_task' }] });
    effectsService.revokeOwned.mockResolvedValue({ revoked: true, effectId: 5 });
    const r = await sandbox.run('s5_revoke', '42');
    expect(r.outcome).toBe('passed');
    expect(r.effectId).toBe(5);
    expect(effectsService.revokeOwned).toHaveBeenCalledWith(5, '42');

    effectsService.listOwned.mockResolvedValue({ items: [] });
    const r2 = await sandbox.run('s5_revoke', '43');
    expect(r2.outcome).toBe('guide');

    // revoke 未生效 → outcome check + 诚实文案（不误报「已软删」）
    effectsService.listOwned.mockResolvedValue({ items: [{ id: 5, resultType: 'crm_task' }] });
    effectsService.revokeOwned.mockResolvedValue({ revoked: false, effectId: 5, revokeStatus: 'revoke_failed' });
    const r3 = await sandbox.run('s5_revoke', '42');
    expect(r3.outcome).toBe('check');
    expect(String(r3.detail)).toContain('未生效');
  });

  it('s6_java：返回 Java 引导', async () => {
    const r = await sandbox.run('s6_java', '42');
    expect(r.outcome).toBe('guide');
    expect(String(r.detail)).toContain('java-starter');
  });

  it('未知场景 → unknown', async () => {
    const r = await sandbox.run('sx_unknown', '42');
    expect(r.outcome).toBe('unknown');
  });
});
