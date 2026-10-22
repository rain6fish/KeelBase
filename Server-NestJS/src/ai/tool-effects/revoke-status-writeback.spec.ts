// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { Column, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AiToolSideEffect } from '../../governance-shared/entities/ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { LocalEntityRevoker } from './side-effect-revoker';

/**
 * PRE-3: a failed `revoke_status` write must not be silent, and the read side must read the result
 * as **unknown**, never as "not revoked".
 *
 * The defect: the local path soft-deleted the target (fact layer) and then wrote `revoke_status`
 * (predicate layer) in a `catch → warn`. If the write failed, the facts had changed while the column
 * every reader (`isRestored`, `skipReason`) depends on stayed empty. After a recycle-bin restore that
 * row looked exactly like "never revoked", and the A-3 restored state silently degraded.
 *
 * The fix ordered the writes: the intent (`compensating`) lands **before** the soft-delete, so a
 * crash or a failed terminal write leaves a record that says "outcome unknown". These cases pin both
 * halves and run through the **caller** (`revoke` / `listOwned`), not the private helper.
 *
 * PRE-3：`revoke_status` 写失败不得静默，读侧必须读作**未知**，绝不是「未撤销」。
 *
 * 缺陷原形：本地路径先软删目标（事实层），再用 `catch → warn` 写 `revoke_status`（判据层）。写入失败时，
 * 事实已改，而每个读侧（`isRestored`、`skipReason`）依赖的那一列仍是空的。回收站恢复之后，该行看起来
 * 与「从未撤销」完全一样，A-3 的恢复态因此静默退化。
 *
 * 修法是给写入排序：意图（`compensating`）在软删**之前**落库，故崩溃或终态写失败都会留下一条
 *「结果未知」的记录。以下用例同时钉住两半，并且走**调用方**（`revoke` / `listOwned`），不直接调私有函数。
 */
@Entity('events')
class Event {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: true })
  title?: string;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date | null;
}

describe('PRE-3 撤销态回写失败：大声且读作未知', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;
  const effects = () => ds.getRepository(AiToolSideEffect);
  const events = () => ds.getRepository(Event);

  const build = (): AiToolEffectsService =>
    new AiToolEffectsService(
      effects() as never,
      new LocalEntityRevoker(ds.manager) as never,
      undefined,
      undefined,
      undefined,
      undefined,
      ds as never,
    );

  const seedEvent = async (id: number, title: string): Promise<void> => {
    await events().save(events().create({ id, title } as never));
  };

  const seedEffect = async (
    over: Partial<AiToolSideEffect> = {},
  ): Promise<AiToolSideEffect> => {
    const row = effects().create({
      idempotencyKey: `key-${over.id ?? 1}`,
      userId: '42',
      conversationId: 'conv-1',
      toolName: 'create_event',
      argsHash: 'hash',
      resultType: 'event',
      resultId: 1,
      revokeClass: 'local_compensate',
      revokeStatus: null,
      ...over,
    } as never);
    return (await effects().save(row)) as unknown as AiToolSideEffect;
  };

  const targetDeletedAt = async (id = 1): Promise<Date | null> => {
    const row = await events().findOne({ where: { id }, withDeleted: true });
    return row?.deletedAt ?? null;
  };

  /** Fail the **terminal** write only; the intent write is left on the real repository. */
  const failTerminalWrite = (match: (criteria: unknown, patch: { revokeStatus?: string }) => boolean) => {
    const real = effects().update.bind(effects());
    jest.spyOn(effects(), 'update').mockImplementation((async (
      criteria: unknown,
      patch: { revokeStatus?: string },
    ) => {
      if (match(criteria, patch)) throw new Error('disk I/O error (injected)');
      return real(criteria as never, patch as never);
    }) as never);
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect, Event],
      synchronize: true,
    });
    await ds.initialize();
    svc = build();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await ds.destroy();
  });

  it('正常撤销（对照）：终态落库，恢复前后两态都读得对', async () => {
    await seedEvent(1, 'E1');
    const effect = await seedEffect();

    const res = await svc.revoke(effect.id);

    expect(res).toMatchObject({ revoked: true, revokeStatus: 'revoked' });
    expect(await targetDeletedAt()).not.toBeNull();
    const row = (await effects().findOneBy({ id: effect.id }))!;
    expect(row.revokeStatus).toBe('revoked');
    expect(svc.restoreState(row, true)).toBe('not_restored');

    // 回收站恢复：只清 deletedAt、不动 revoke_status（RC-3 既定语义）
    await ds.query(`UPDATE "events" SET "deleted_at" = NULL WHERE "id" = 1`);
    const restored = (await effects().findOneBy({ id: effect.id }))!;
    expect(svc.restoreState(restored, false)).toBe('restored');
    expect(svc.isRestored(restored, false)).toBe(true);
  });

  it('终态写失败：事实层已改、记录未落 ⇒ 大声（error 日志）+ 行停在 compensating', async () => {
    await seedEvent(1, 'E1');
    const effect = await seedEffect();
    const logError = jest.spyOn((svc as unknown as { logger: { error: (...a: unknown[]) => void } }).logger, 'error');

    // 只让终态（revoked）写失败；意图（compensating）照常落库。
    failTerminalWrite((criteria, patch) => typeof criteria === 'number' && patch?.revokeStatus === 'revoked');

    const res = await svc.revoke(effect.id);

    // 事实层改了，但结果**不得**声称已撤销：compensating = 结果未知。
    expect(await targetDeletedAt()).not.toBeNull();
    expect(res).toMatchObject({
      revoked: false,
      revokeStatus: 'compensating',
      skipped: true,
      reason: 'compensating',
      external: false,
    });
    expect(res?.message).toMatch(/状态未知|未知/);

    // 大声：不是 warn、不是静默。
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('revoke state write FAILED'));

    const row = (await effects().findOneBy({ id: effect.id }))!;
    // 记录先于事实层：意图仍在，读侧因此有东西可读。
    expect(row.revokeStatus).toBe('compensating');
  });

  it('终态写失败 + 目标已恢复：读侧读作「未知」，不是「未撤销」（A-3 不再静默退化）', async () => {
    await seedEvent(1, 'E1');
    const effect = await seedEffect();
    jest.spyOn((svc as unknown as { logger: { error: (...a: unknown[]) => void } }).logger, 'error').mockImplementation(() => undefined);
    failTerminalWrite((criteria, patch) => typeof criteria === 'number' && patch?.revokeStatus === 'revoked');

    await svc.revoke(effect.id);
    // 回收站恢复之后，「已补偿但终态未落」与「从未撤销」的可观测形状相同 —— 只有记录能分开它们。
    await ds.query(`UPDATE "events" SET "deleted_at" = NULL WHERE "id" = 1`);

    const row = (await effects().findOneBy({ id: effect.id }))!;
    expect(row.revokeStatus).toBe('compensating');

    // A-3 三值：这里必须是 unknown；布尔面 false 只表示「未被证明恢复」。
    expect(svc.restoreState(row, false)).toBe('unknown');
    expect(svc.isRestored(row, false)).toBe(false);

    // 列表读侧：不得落回 executed（=「没撤销」）。compensating 的冻结枚举桶是 revoking_external。
    const listed = await svc.listOwned('42');
    expect(listed.items[0]?.status).toBe('revoking_external');

    // 再次撤销：读作「未知 / 不重试」，而不是「未撤销 ⇒ 再撤一次」。
    const again = await svc.revoke(effect.id);
    expect(again).toMatchObject({
      skipped: true,
      reason: 'compensating',
      revoked: false,
      external: false,
    });
    expect(again?.message).toMatch(/未知/);
    // 没有再次软删/外呼的副作用面：目标已是恢复态，未被再次改动
    expect(await targetDeletedAt()).toBeNull();
  });

  it('组级：一个成员终态未落 ⇒ 该成员读作未知，组不谎称完成；另一个成员照常落库', async () => {
    await seedEvent(1, 'E1');
    await seedEvent(2, 'E2');
    const group = 'grp-pre3';
    const root = await seedEffect({ id: 1, resultId: 1, compensationGroup: group, parentEffectId: null });
    const child = await seedEffect({
      id: 2,
      idempotencyKey: 'key-2',
      resultId: 2,
      compensationGroup: group,
      parentEffectId: 1,
    });
    jest.spyOn((svc as unknown as { logger: { error: (...a: unknown[]) => void } }).logger, 'error').mockImplementation(() => undefined);
    // 只让成员 2 的终态写失败。
    failTerminalWrite((criteria, patch) => criteria === child.id && patch?.revokeStatus === 'revoked');

    const res = await svc.revoke(root.id);

    expect(res).toMatchObject({ revoked: false, revokeStatus: 'compensating' });
    expect(res!.cascade).toEqual({ groupId: group, total: 2, revoked: 1, skipped: 1, failed: 0 });
    expect(res!.message).toMatch(/状态未知/);
    // 事实层：两条目标都真的软删了
    expect(await targetDeletedAt(1)).not.toBeNull();
    expect(await targetDeletedAt(2)).not.toBeNull();
    // 记录层：只有成员 1 的终态落库
    expect((await effects().findOneBy({ id: root.id }))!.revokeStatus).toBe('revoked');
    expect((await effects().findOneBy({ id: child.id }))!.revokeStatus).toBe('compensating');

    // 以未知成员为入口再撤：读作未知，不重试、也不报完成。
    const again = await svc.revoke(child.id);
    expect(again).toMatchObject({ skipped: true, reason: 'compensating', revoked: false });
  });
});
