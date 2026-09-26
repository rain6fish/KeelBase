// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { LocalEntityRevoker } from './side-effect-revoker';

/**
 * ARC-3：外部补偿**派发入口**要有 CAS —— 并发两次撤销不得派发两次。
 *
 * 此前派发是裸 read-modify-write：先无条件写「意图」（compensating），再外呼。两次并发撤销会**各自读到
 * `revoke_status = null`**、各自写意图、**各派发一次**。退款 / 取消订单这类端点若非幂等，那就是**真双发**；
 * 而且先成功、后失败的那次会把 `revoke_failed` **覆盖**掉先前的成功读数。
 *
 * 现把「写意图」这一步变成**条件更新（认领）**：只有仍处「未派发」（NULL）或「上次失败可重试」
 * （`revoke_failed`）的行才放行派发，命中 0 行 ⇒ 不派发、如实回报。认领落地后本轮派发只有一个写者，
 * 覆盖风险随之一并消失。
 *
 * 本组用例钉的是**旧实现不可能产出的观测面**：旧实现里两次并发都会外呼 ⇒ 「只调用一次」为假，
 * 故第 1 条对旧实现为红。第 2 条是反向对照 —— 它要求认领**不要挡掉重试**（`revoke_failed` 本来就可重试）。
 *
 * 用真 sqlite：条件更新的命中与未命中都是真的；外呼用一个**可控的**替身，以便确定性地复现竞态窗口。
 */
describe('ARC-3 外部补偿派发认领：并发两次只派发一次', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;
  const effects = () => ds.getRepository(AiToolSideEffect);

  const build = (externalRevoker: unknown): AiToolEffectsService =>
    new AiToolEffectsService(
      effects() as never,
      new LocalEntityRevoker(ds.manager) as never,
      externalRevoker as never,
    );

  const seedEffect = async (): Promise<AiToolSideEffect> =>
    effects().save(
      effects().create({
        idempotencyKey: 'key-ext',
        userId: '42',
        conversationId: 'conv-1',
        toolName: 'proxy_side_create',
        argsHash: 'hash',
        resultType: 'proxy_call',
        resultId: 7,
        revokeClass: 'governed_external',
        revokeStatus: null,
      }),
    );

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect],
      synchronize: true,
    });
    await ds.initialize();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('并发两次（都读到「未派发」）：只有一条认领得到 → 外部 revoker 只被调用一次', async () => {
    let entered!: () => void;
    const enteredP = new Promise<void>((r) => (entered = r));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const externalRevoker = {
      revoke: jest.fn(async () => {
        entered();
        await gate;
        return { ok: true, message: 'ok' };
      }),
    };
    svc = build(externalRevoker);
    const effect = await seedEffect();

    // 竞态的形态：两条并发都在**认领之前**读到这一行 ⇒ 两条的内存视图都是「未派发」
    const stale1 = await effects().findOneByOrFail({ id: effect.id });
    const stale2 = await effects().findOneByOrFail({ id: effect.id });
    expect(stale1.revokeStatus).toBeNull();
    expect(stale2.revokeStatus).toBeNull();

    const p1 = (svc as any)._doRevokeSingle(stale1);
    await enteredP; // 第一条已认领（写库成功）并进入外呼
    // 先发起第二条、**再**放行 gate，最后一起 await：旧实现下第二条也会进入外呼（那正是缺陷），
    // 但它不该把测试挂死——让它走到断言上失败，而不是等超时。
    const r2p = (svc as any)._doRevokeSingle(stale2);
    release();
    const [, r2] = await Promise.all([p1, r2p]);

    expect(externalRevoker.revoke).toHaveBeenCalledTimes(1);
    expect(r2).toMatchObject({ revoked: false, skipped: true, reason: 'compensating' });
    // 第一次确实认领到了（也就证明这条谓词**匹配得上 NULL** —— 写成 `IN (NULL, …)` 就永远认领不到）
    expect((await effects().findOneByOrFail({ id: effect.id })).revokeStatus).toBe('compensating');
  });

  it('反向对照：上次派发**失败**（revoke_failed）仍可重试 —— 认领不挡重试', async () => {
    const externalRevoker = { revoke: jest.fn().mockResolvedValue({ ok: false, message: 'boom' }) };
    svc = build(externalRevoker);
    const effect = await seedEffect();

    await svc.revoke(effect.id);
    expect((await effects().findOneByOrFail({ id: effect.id })).revokeStatus).toBe('revoke_failed');

    await svc.revoke(effect.id);

    expect(externalRevoker.revoke).toHaveBeenCalledTimes(2);
  });

  it('反向对照：已在派发中（compensating）不再派发', async () => {
    const externalRevoker = { revoke: jest.fn().mockResolvedValue({ ok: true, message: 'ok' }) };
    svc = build(externalRevoker);
    const effect = await seedEffect();
    await svc.revoke(effect.id); // 落至 compensating 且带确认

    const again = await svc.revoke(effect.id);

    expect(externalRevoker.revoke).toHaveBeenCalledTimes(1);
    expect(again?.skipped).toBe(true);
    expect(again?.revoked).toBe(false);
  });
});

/**
 * 认领的 **fail-closed** 边界：底层没给出可判定的 `affected` 时**不得派发**。
 *
 * 真 sqlite 总会返回 `affected`，所以这一条只能用替身 —— 它守的是「读数缺失」与「读数说 0」是两件事：
 * 前者不该被读成许可。口径同 `ConfirmationStore.resolve`（拿不到 `affected` 一律拒），
 * 理由也一样：宁可少派发一次（可重试），也不多执行一次不可逆的外部操作。
 */
describe('ARC-3 认领 fail-closed：affected 缺失即不派发', () => {
  it('替身不给 affected → 不外呼，且不谎报已撤销', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue({
        id: 8,
        userId: '1',
        toolName: 'java_ext',
        resultType: 'proxy_call',
        resultId: 10,
        compensationGroup: null,
        revokeClass: 'governed_external',
        revokeStatus: null,
      }),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}), // ← 故意不给 affected
      create: jest.fn((d: unknown) => d),
      save: jest.fn(),
    };
    const externalRevoker = { revoke: jest.fn().mockResolvedValue({ ok: true, message: 'ok' }) };
    const svc = new AiToolEffectsService(repo as never, undefined, externalRevoker as never);

    const res = await svc.revoke(8);

    expect(externalRevoker.revoke).not.toHaveBeenCalled();
    expect(res?.revoked).toBe(false);
    expect(res?.skipped).toBe(true);
  });
});
