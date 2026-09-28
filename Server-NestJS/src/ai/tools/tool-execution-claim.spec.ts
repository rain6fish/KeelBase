// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolExecution } from './ai-tool-execution.entity';
import { AiToolSideEffect } from '../tool-effects/ai-tool-side-effect.entity';
import { AiToolEffectsService } from '../tool-effects/ai-tool-effects.service';
import { EXECUTION_LEASE_MS } from '../confirmation/execution-state';
import { ToolExecutionService } from './tool-execution.service';

/**
 * ACT-5：**幂等从「探测」变成「闸门」**。
 *
 * 此前 `executeWrite` 是 `check → execute → record`：幂等探测读一个键，而承载该键的锚行跑完才写。
 * 于是（a）并发两次同参数调用**各miss探测、各执行一次**；（b）崩溃后的重试会**再执行一次**可能已经
 * 落地的写（`docs/failure-path-corpus.spec.md` FP-10 记的就是这个窗口）。
 *
 * 本组用例钉的是**对旧实现不可能的观测面**：旧实现下目标被执行的**次数**。用真 sqlite + 真副作用登记
 * 器：认领是数据库唯一键上的仲裁，「mock 掉数据库」会把被测的那件事本身拿掉。
 */
describe('ACT-5 执行认领：同键只有一个能跑', () => {
  let ds: DataSource;
  let svc: ToolExecutionService;
  let executed: number;
  let gate: {
    assertToolAllowed: jest.Mock;
    assertWithinDeclaredScope: jest.Mock;
    destinationOf: jest.Mock;
    requiresApproval: jest.Mock;
  };

  const executions = () => ds.getRepository(AiToolExecution);
  const effects = () => ds.getRepository(AiToolSideEffect);
  const keyFor = (args: Record<string, unknown>) =>
    AiToolEffectsService.buildKey({ userId: '42', conversationId: 'conv-1', toolName: 'create_event', args });

  /** 写工具替身：每被真正执行一次就 +1，并返回一个可登记的目标 id。 */
  const build = (): ToolExecutionService => {
    const registry = {
      execute: jest.fn(async () => {
        executed += 1;
        return { success: true, data: { id: 7 } };
      }),
    };
    return new ToolExecutionService(
      registry as never,
      gate as never,
      { current: null } as never,
      new AiToolEffectsService(effects() as never) as never,
      undefined,
      executions() as never,
    );
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolExecution, AiToolSideEffect],
      synchronize: true,
    });
    await ds.initialize();
    executed = 0;
    gate = {
      assertToolAllowed: jest.fn(async () => undefined),
      assertWithinDeclaredScope: jest.fn(async () => undefined),
      destinationOf: jest.fn(() => 'local'),
      requiresApproval: jest.fn(async () => false),
    };
    svc = build();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('**并发同键两次** ⇒ 目标只被执行一次（旧实现下这里是 2 次）', async () => {
    const args = { title: '产品评审' };

    const [a, b] = await Promise.all([
      svc.executeWrite('create_event', args, '42', 'conv-1'),
      svc.executeWrite('create_event', args, '42', 'conv-1'),
    ]);

    expect(executed).toBe(1);
    // 一个拿到执行权、一个被如实拒（不是谎报成功，也不是谎报失败）
    const results = [a, b];
    expect(results.filter((r) => r.success)).toHaveLength(1);
    const refused = results.find((r) => !r.success);
    expect(refused?.error).toContain('正在进行中');
    // 键上只有一行执行身份
    expect(await executions().count()).toBe(1);
  });

  it('**崩溃重试** ⇒ 读到那条认领，而不是再执行一次（旧实现下会再执行）', async () => {
    const args = { title: '产品评审' };
    const key = keyFor(args);
    // 模拟「认领了、进程崩在落定之前」：行在、settled_at 与 error 都空、认领已过租约
    const stale = new Date(Date.now() - EXECUTION_LEASE_MS - 60_000);
    await executions().save(
      executions().create({
        idempotencyKey: key,
        userId: '42',
        conversationId: 'conv-1',
        toolName: 'create_event',
        createdAt: stale,
      }),
    );

    const r = await svc.executeWrite('create_event', args, '42', 'conv-1');

    expect(executed).toBe(0);
    expect(r.success).toBe(false);
    // 既不说成功也不说失败 —— 这是本项全部的意义所在
    expect(r.error).toContain('结果未知');
    expect(r.error).toContain('不得视为成功');
  });

  it('**已落定** ⇒ 幂等回放既有结果（这条行为与拆分前逐字一致）', async () => {
    const args = { title: '产品评审' };
    const key = keyFor(args);
    await executions().save(
      executions().create({
        idempotencyKey: key,
        userId: '42',
        toolName: 'create_event',
        settledAt: new Date(),
      }),
    );
    await effects().save(
      effects().create({
        idempotencyKey: key,
        userId: '42',
        conversationId: 'conv-1',
        toolName: 'create_event',
        argsHash: 'h',
        resultType: 'event',
        resultId: 7,
      }),
    );

    const r = await svc.executeWrite('create_event', args, '42', 'conv-1');

    expect(executed).toBe(0);
    expect(r).toEqual({ success: true, data: { id: 7, idempotent: true } });
  });

  it('正常一次 ⇒ 落定（settled_at 非空），且副作用照旧登记', async () => {
    const r = await svc.executeWrite('create_event', { title: '产品评审' }, '42', 'conv-1');

    expect(r.success).toBe(true);
    expect(executed).toBe(1);
    const row = await executions().findOne({ where: { idempotencyKey: keyFor({ title: '产品评审' }) } });
    expect(row?.settledAt).toBeTruthy();
    expect(row?.error ?? null).toBeNull();
    expect(await effects().count()).toBe(1);
  });

  it('工具**报失败** ⇒ 落定写 error（有记录的失败，与「从未落定」分得开）', async () => {
    const registry = {
      execute: jest.fn(async () => ({ success: false, error: '目标不可写' })),
    };
    const failing = new ToolExecutionService(
      registry as never,
      gate as never,
      { current: null } as never,
      new AiToolEffectsService(effects() as never) as never,
      undefined,
      executions() as never,
    );

    const r = await failing.executeWrite('create_event', { title: 'x' }, '42', 'conv-1');

    expect(r.success).toBe(false);
    const row = await executions().findOne({ where: { idempotencyKey: keyFor({ title: 'x' }) } });
    expect(row?.error).toBe('目标不可写');
    expect(row?.settledAt ?? null).toBeNull();
  });

  it('**门控拒绝不占用键**：被拒的调用不写执行行 —— 一次拒绝不得把该键毒化成「永远拒绝重试」', async () => {
    gate.assertToolAllowed.mockRejectedValue(new Error('R5 阻断'));

    await expect(svc.executeWrite('create_event', { title: 'x' }, '42', 'conv-1')).rejects.toThrow(/R5/);

    expect(await executions().count()).toBe(0);
  });

  it('**反向对照**：降级装配（无执行身份仓储）⇒ 退回拆分前的行为，同键两次**各跑一次**', async () => {
    const registry = {
      execute: jest.fn(async () => {
        executed += 1;
        return { success: true, data: { id: 7 } };
      }),
    };
    const degraded = new ToolExecutionService(
      registry as never,
      gate as never,
      { current: null } as never,
      new AiToolEffectsService(effects() as never) as never,
      // 第 6 个形参（执行身份仓储）**有意省略** —— 这正是部署态以外的那种装配
    );
    const args = { title: '产品评审' };

    await Promise.all([
      degraded.executeWrite('create_event', args, '42', 'conv-1'),
      degraded.executeWrite('create_event', args, '42', 'conv-1'),
    ]);

    // 没有认领就没有仲裁点 —— 这条断言同时是对上面「旧实现下这里是 2 次」的实证
    expect(executed).toBe(2);
  });

  it('REV-7：`authorizationRef` 落进执行行；免确认的自动写为 `null`（没有授权，也就没有窗口）', async () => {
    await svc.executeWrite('create_event', { title: 'a' }, '42', 'conv-1', undefined, {
      authorizationRef: 'tok-1',
    });
    await svc.executeWrite('create_event', { title: 'b' }, '42', 'conv-1');

    expect((await executions().findOne({ where: { idempotencyKey: keyFor({ title: 'a' }) } }))?.authorizationRef).toBe(
      'tok-1',
    );
    expect(
      (await executions().findOne({ where: { idempotencyKey: keyFor({ title: 'b' }) } }))?.authorizationRef ?? null,
    ).toBeNull();
  });
});
