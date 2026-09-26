// SPDX-License-Identifier: Apache-2.0

import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { ToolExecutionService } from '../tools/tool-execution.service';
import { ToolGateService } from '../tools/tool-gate.service';
import { ExternalToolRegistry } from '../tools/external-tool-registry';

/**
 * ARC-4：幂等键被**非本组成员**占用时，整份声明此前会**静默消失**。
 *
 * 冲突分支取 `listGroup(baseKey)` 找回既有组；而一条**单目标**行（`compensation_group` 为 null）同样占着
 * 这个键，按组查必空 ⇒ 返回 `[]`。`_markDisputeIfDeclarationDifffers` 又在「无既有行」时直接返回，
 * 于是**比对、标记一起没发生**；调用方再把返回值丢掉 ⇒ 本次声明的成员一行都没登记、业务动作不可撤，
 * 而链路上没有任何一处说得出这件事。
 *
 * ⚠ **复核时更正了登记文本的一处推断**：它说这条路径由「先单目标登记、后复合登记」**顺序**触发 ——
 * 实测**到不了**：写管道里幂等探测（`findExisting(buildKey)`）排在 `recordGroup` **之前**，键一旦被占，
 * 顺序执行会命中探测并早返回。真正的入口是**竞态窗口**（两次并发各自探测未命中，先插入者占键）。
 * 故本组用例：服务级直接构造该状态；调用侧用「探测读到旧值」**确定性地**模拟那个窗口。
 *
 * 用真 sqlite：唯一冲突是真的，标记也是真的落库。
 */
const CTX = { userId: '42', conversationId: 'conv-1', toolName: 'create_project_with_tasks', args: { title: 'X' } };
const DECLARED = [
  { resultType: 'event', resultId: 1 },
  { resultType: 'pm_task', resultId: 2 },
];

describe('ARC-4 幂等键被非本组成员占用：整份声明不得静默消失', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;
  const effects = () => ds.getRepository(AiToolSideEffect);
  const key = AiToolEffectsService.buildKey(CTX);

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect],
      synchronize: true,
    });
    await ds.initialize();
    svc = new AiToolEffectsService(effects() as never);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('占用者是**单目标**行 → 返回 []，且该行被标成争议（证据 = 持有里有、声明里没有）', async () => {
    await svc.record(CTX, 'event', 1); // 先落一条单目标行：它占着 baseKey，compensationGroup 为 null
    const occupant = await effects().findOneByOrFail({ idempotencyKey: key });
    expect(occupant.compensationGroup).toBeNull();
    expect(occupant.revokeDispute).toBeNull();

    const registered = await svc.recordGroup(CTX, DECLARED);

    // 本次声明**一行都没登记**——返回值如实说明这一点（旧实现返回 [] 且**不标**，故下一条为红）
    expect(registered).toEqual([]);
    const after = await effects().findOneByOrFail({ idempotencyKey: key });
    expect(after.revokeDispute).not.toBeNull();
    const evidence = JSON.parse(after.revokeDispute!) as {
      declared: unknown[];
      stored: unknown[];
      onlyDeclared: unknown[];
      onlyStored: unknown[];
    };
    expect(evidence.declared).toHaveLength(2);
    expect(evidence.stored).toEqual([{ resultType: 'event', resultId: 1 }]); // 占键的那一行
    // 占键的那一行恰与声明第 1 条重合（event #1），故「声明里有、持有里没有」只剩第 2 条 ——
    // 这正是真实语义：声明里**没**被登记的成员是这条，而占位的 event #1 本身也不是这次登记落的。
    expect(evidence.onlyDeclared).toEqual([{ resultType: 'pm_task', resultId: 2 }]);
    // 而它并不落在「持有里有、声明里没有」那一侧（它就在声明里）——差集只有一个方向非空。
    expect(evidence.onlyStored).toEqual([]);
  });

  it('反向对照：诚实的幂等重放（本组已在）→ 返回既有组，且**不**标争议', async () => {
    await svc.recordGroup(CTX, DECLARED);
    const before = await svc.listGroup(key);
    expect(before).toHaveLength(2);

    const again = await svc.recordGroup(CTX, DECLARED);

    expect(again.map((e) => e.id)).toEqual(before.map((e) => e.id));
    const root = await effects().findOneByOrFail({ id: before[0].id });
    expect(root.revokeDispute).toBeNull(); // 声明与持有一致 ⇒ 不制造标记
  });
});

/**
 * 调用侧：`recordGroup` 的返回值**不再被忽略**。
 *
 * 用「幂等探测读到旧值」确定性地复现竞态窗口 —— 探测说「没有既有行」，而键其实已被占：
 * 于是写照常执行、登记却一行都落不下。这时工具结果**仍是成功**（业务写确实发生了，
 * 把它报成失败是另一种谎），但「写了却不可撤」必须有人说得出来。
 */
describe('ARC-4 调用侧：写了但一行都没登记时，不得当作没发生', () => {
  let ds: DataSource;
  let execution: ToolExecutionService;
  let effectsSvc: AiToolEffectsService;
  let warnSpy: jest.SpyInstance;

  const registry = {
    getTool: jest.fn().mockReturnValue({ requiresConfirmation: true }),
    getToolDefinitions: jest.fn().mockReturnValue([]),
    execute: jest.fn().mockResolvedValue({
      success: true,
      data: { effects: [{ resultType: 'event', resultId: 1 }, { resultType: 'pm_task', resultId: 2 }] },
    }),
    requiresConfirmation: jest.fn().mockReturnValue(false),
    riskLevel: jest.fn().mockReturnValue('R1'),
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect],
      synchronize: true,
    });
    await ds.initialize();
    effectsSvc = new AiToolEffectsService(effects() as never);
    const external = new ExternalToolRegistry();
    execution = new ToolExecutionService(
      registry as never,
      new ToolGateService(registry as never, external),
      external,
      effectsSvc,
    );
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    await ds.destroy();
  });

  const effects = () => ds.getRepository(AiToolSideEffect);

  it('探测读到旧值（竞态窗口）→ 写仍成功，但「一行都没登记」被说出来', async () => {
    // 先占键（模拟并发的另一端先落单目标行）
    await effectsSvc.record(CTX, 'event', 1);
    // 探测读到的是**过期读数**：说「没有既有行」
    jest.spyOn(effectsSvc, 'findExisting').mockResolvedValue({ existing: false });

    const res = await execution.executeWrite(CTX.toolName, CTX.args, CTX.userId, CTX.conversationId);

    expect(res.success).toBe(true); // 业务写确实发生了——不谎报失败
    const said = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(said).toContain('一行都没登记');
    expect(said).toContain('不可撤');
  });
});
