// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiWriteClaim, WRITE_CLAIM_STATUS } from './ai-write-claim.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { ToolExecutionService } from '../tools/tool-execution.service';

/**
 * ACT-5/6 切片 1（roadmap §2.1.16）：**本地实体写**在执行前占位，使「这次调用是否已在执行」
 * 有一个不依赖「写已完成」的答案。
 *
 * 为什么必须是真的数据库：仲裁点是 `ai_write_claims.idempotency_key` 的**唯一约束** ——
 * 它是数据库侧的判定，不是映射层能决定的事。用替身测「谁赢」等于测替身。
 *
 * **对旧实现为红**：旧路径是 check-then-act（`findExisting → execute → record`），
 * 已有人持有时它**照样执行**，且全库没有 `ai_write_claims` 这张表 ——
 * 故第 2/3/4 条的断言在旧实现下无法成立，不是「差不多的断言」。
 */
const CTX = {
  userId: 'u-alice',
  conversationId: 'conv-1',
  toolName: 'create_followup',
  args: { customerId: 7, title: '跟进' },
};

describe('ACT-5/6 切片1：本地写 claim → execute → settle', () => {
  let ds: DataSource;
  let effects: AiToolEffectsService;
  let exec: ToolExecutionService;
  let executeMock: jest.Mock;

  const claims = () => ds.getRepository(AiWriteClaim);
  const key = () => AiToolEffectsService.buildKey(CTX);

  const build = (): void => {
    const toolRegistry = {
      execute: executeMock,
      getTool: () => ({ name: CTX.toolName }),
    };
    const toolGate = {
      assertToolAllowed: jest.fn().mockResolvedValue(undefined),
      assertWithinDeclaredScope: jest.fn().mockResolvedValue(undefined),
      // ACT-7：执行点新增的审批要求复算（闸门接口长大了，替身必须满足）
      assertApprovalRequirementHolds: jest.fn().mockResolvedValue(undefined),
      destinationOf: () => 'local',
    };
    const externalTools = { current: undefined };
    // 位置式装配：`claimsRepo` 在构造器**末尾**（第 11 位），故中间位补 undefined ——
    // 这正是把它放末尾的原因（既有 39 处位置式装配不受扰动）。
    effects = new AiToolEffectsService(
      ds.getRepository(AiToolSideEffect),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      claims(),
    );
    exec = new ToolExecutionService(
      toolRegistry as any,
      toolGate as any,
      externalTools as any,
      effects,
      undefined,
    );
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect, AiWriteClaim],
      synchronize: true,
    });
    await ds.initialize();
    executeMock = jest.fn().mockResolvedValue({ success: true, data: { id: 42 } });
    build();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('正常路径：占位赢得 → 执行一次 → 落定并指回副作用行', async () => {
    const res = await exec.executeWrite(
      CTX.toolName,
      CTX.args,
      CTX.userId,
      CTX.conversationId,
    );

    expect(res.success).toBe(true);
    expect(executeMock).toHaveBeenCalledTimes(1);

    const row = await claims().findOne({ where: { idempotencyKey: key() } });
    expect(row?.status).toBe(WRITE_CLAIM_STATUS.SETTLED);
    expect(row?.settledAt).toBeInstanceOf(Date);
    // effectId 指向登记下来的副作用行 —— 让占位行**自己**答得出「这次执行产出了哪条副作用」
    expect(row?.effectId).toBeTruthy();
    const effect = await ds
      .getRepository(AiToolSideEffect)
      .findOne({ where: { idempotencyKey: key() } });
    expect(row?.effectId).toBe(effect?.id);
  });

  it('已有人持有 ⇒ **绝不重复执行**（旧实现在此照样执行）', async () => {
    // 模拟「另一请求已占位、尚未落定」
    await claims().save(
      claims().create({
        idempotencyKey: key(),
        userId: CTX.userId,
        conversationId: CTX.conversationId,
        toolName: CTX.toolName,
        argsHash: 'h',
        status: WRITE_CLAIM_STATUS.CLAIMED,
        claimedAt: new Date(),
        attempts: 1,
      }),
    );

    const res = await exec.executeWrite(
      CTX.toolName,
      CTX.args,
      CTX.userId,
      CTX.conversationId,
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain('已由另一请求接管');
    // 关键：工具**一次都没执行**。旧实现读不到占位，会照写第二遍。
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('本地写失败 ⇒ 释放占位，重试仍可用（不自造「不可重试」）', async () => {
    executeMock.mockRejectedValueOnce(new Error('校验失败：客户不存在'));

    await expect(
      exec.executeWrite(CTX.toolName, CTX.args, CTX.userId, CTX.conversationId),
    ).rejects.toThrow('校验失败');

    const afterFail = await claims().findOne({ where: { idempotencyKey: key() } });
    expect(afterFail?.status).toBe(WRITE_CLAIM_STATUS.RELEASED);
    expect(afterFail?.releaseReason).toBe('execute_failed');

    // 重试：同一键重新占位 → 这次执行并落定（若失败被锁成不可重试，此处会「已由另一请求接管」而红）
    executeMock.mockResolvedValueOnce({ success: true, data: { id: 43 } });
    const retry = await exec.executeWrite(
      CTX.toolName,
      CTX.args,
      CTX.userId,
      CTX.conversationId,
    );

    expect(retry.success).toBe(true);
    expect(executeMock).toHaveBeenCalledTimes(2);
    const afterRetry = await claims().findOne({ where: { idempotencyKey: key() } });
    expect(afterRetry?.status).toBe(WRITE_CLAIM_STATUS.SETTLED);
    expect(afterRetry?.attempts).toBe(2);
  });

  it('崩溃残留：仍是 claimed 且已过阈值 ⇒ **可见**；且不自动改写状态', async () => {
    await claims().save(
      claims().create({
        idempotencyKey: 'key-crashed',
        userId: CTX.userId,
        toolName: CTX.toolName,
        argsHash: 'h',
        status: WRITE_CLAIM_STATUS.CLAIMED,
        claimedAt: new Date(Date.now() - 60 * 60 * 1000),
        attempts: 1,
      }),
    );
    await claims().save(
      claims().create({
        idempotencyKey: 'key-fresh',
        userId: CTX.userId,
        toolName: CTX.toolName,
        argsHash: 'h',
        status: WRITE_CLAIM_STATUS.CLAIMED,
        claimedAt: new Date(),
        attempts: 1,
      }),
    );

    const stale = await effects.listStaleClaims(10 * 60 * 1000);
    expect(stale.map((c) => c.idempotencyKey)).toEqual(['key-crashed']);

    // 读**不改**状态：KeelBase 不知道那次执行是否落了库，自动改写就是拿猜测冒充事实
    const still = await claims().findOne({ where: { idempotencyKey: 'key-crashed' } });
    expect(still?.status).toBe(WRITE_CLAIM_STATUS.CLAIMED);
  });

  it('未装配仓库（既有单测装配形态）⇒ 退回旧行为，不因缺仓库而崩', async () => {
    const bare = new AiToolEffectsService(ds.getRepository(AiToolSideEffect));
    await expect(bare.claimWrite(CTX)).resolves.toEqual({ won: true });
  });

  it('**反向对照**：挡住第二次的是**占位**，不是「已登记」—— 工具不登记副作用时，没有占位就会再写一次', async () => {
    // 工具返回的 data **没有 id** ⇒ 不产生副作用行 ⇒ 下一次调用的 `findExisting` 探测必然落空。
    // 于是同一条序列在两态下给出相反的结果：有占位 ⇒ 第二次被挡；无占位 ⇒ 第二次照样执行。
    // **全程顺序执行，不靠并发** —— 真并发在 sqlite 单连接下的胜负取决于调度，那条断言会 flaky，
    // 而它要说的并不是「谁赢」，是「没有占位时会怎样」。
    executeMock.mockResolvedValue({ success: true, data: {} });

    // ① 有占位（本套件的常规装配）：第一次落定后，第二次被 `settled` 挡住
    await exec.executeWrite(CTX.toolName, CTX.args, CTX.userId, CTX.conversationId);
    executeMock.mockClear();
    const blocked = await exec.executeWrite(CTX.toolName, CTX.args, CTX.userId, CTX.conversationId);
    expect(blocked.success).toBe(false);
    expect(executeMock).not.toHaveBeenCalled();

    // ② 无占位仓储：同一序列下第二次**照样执行**（这就是旧实现的行为，也是本项存在的理由）
    const noClaims = new ToolExecutionService(
      { execute: executeMock, getTool: () => ({ name: CTX.toolName }) } as any,
      {
        assertToolAllowed: jest.fn().mockResolvedValue(undefined),
        assertWithinDeclaredScope: jest.fn().mockResolvedValue(undefined),
      // ACT-7：执行点新增的审批要求复算（闸门接口长大了，替身必须满足）
      assertApprovalRequirementHolds: jest.fn().mockResolvedValue(undefined),
        destinationOf: () => 'local',
      } as any,
      { current: undefined } as any,
      new AiToolEffectsService(ds.getRepository(AiToolSideEffect)) as any,
      undefined,
    );
    executeMock.mockClear();
    await noClaims.executeWrite(CTX.toolName, CTX.args, CTX.userId, CTX.conversationId);
    await noClaims.executeWrite(CTX.toolName, CTX.args, CTX.userId, CTX.conversationId);
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it('消费者②（REV-7）：`authorizationRef` 落进占位行；免确认的自动写为 `null`', async () => {
    await exec.executeWrite(CTX.toolName, CTX.args, CTX.userId, CTX.conversationId, undefined, {
      authorizationRef: 'tok-1',
    });
    await exec.executeWrite(
      CTX.toolName,
      { ...CTX.args, title: '另一件事' },
      CTX.userId,
      CTX.conversationId,
    );

    const withAuth = await claims().findOne({ where: { idempotencyKey: key() } });
    const auto = await claims().findOne({
      where: { idempotencyKey: AiToolEffectsService.buildKey({ ...CTX, args: { ...CTX.args, title: '另一件事' } }) },
    });
    expect(withAuth?.authorizationRef).toBe('tok-1');
    // 没有授权参与 ⇒ `null` 是**答案**（没有审批，也就没有窗口），不是「未知」
    expect(auto?.authorizationRef ?? null).toBeNull();
  });
});
