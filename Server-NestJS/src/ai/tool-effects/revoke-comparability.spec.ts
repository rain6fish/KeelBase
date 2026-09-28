// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { LocalEntityRevoker } from './side-effect-revoker';
import { SideEffectSnapshotCaptor } from './side-effect-snapshot-captor';

/**
 * 测试用最小本地目标实体。**元数据名必须叫 `Event`** —— `resolveLocalEntity` 与 `entityFor('event')`
 * 都按这个名字解析（同 `revoke-content-drift.spec.ts` 的理由：本组只关心「能不能重读到目标」）。
 */
@Entity('events')
class Event {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: true })
  title?: string;

  @Column({ type: 'integer', nullable: true })
  userId?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date | null;
}

/**
 * REV-14「承诺了可比、结果不可比」：**差集要有地方安放，且在判定读作 `complete` 之后仍然可见**。
 *
 * REV-9 在撤销前重读目标、与 `after_snapshot` 比对，但**判不了就不报** —— 目标行没了、读取抛错，
 * 它一律不吭声（猜测比沉默更糟）。代价是：那个成员**确实**被声明为可比、撤销**确实**读了目标、
 * 结果仍然是 `revoked: true`，于是**没有任何地方**说出「这部分检查根本没做」。
 *
 * REV-14 把「承诺」（`after_snapshot` 在 + 捕获器已装配）与「实况」（真的比到了）对差，把差集记在
 * 组根行上。本组用例钉的就是那条主判据，以及它的**反向对照**：比过就算比到（漂移不是差集）、
 * 什么都没承诺就不产生读数 —— 缺了反向对照，一个「凡撤销都报不可比」的实现也能通过，
 * 而那等于把这个读数用噪音关掉。
 *
 * 用**真 sqlite + 真捕获器 + 真撤销器**：「重读目标」这件事 mock 掉任一侧就不再是被测的东西了。
 */
describe('REV-14 撤销承诺比对的成员 vs 真的比到了的成员', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;
  const effects = () => ds.getRepository(AiToolSideEffect);
  const events = () => ds.getRepository(Event);

  /** 建一个实体行 + 一条指向它的副作用行；afterSnapshot 用**真捕获器**产出（与写入时同一形状）。 */
  const seedEffect = async (opts: {
    eventId: number;
    group?: string;
    parentEffectId?: number | null;
  }): Promise<AiToolSideEffect> => {
    const captor = new SideEffectSnapshotCaptor(ds.manager);
    const afterSnapshot = (await captor.captureAfter('event', opts.eventId)).json;
    return effects().save(
      effects().create({
        idempotencyKey: `key-${opts.eventId}-${opts.group ?? 'single'}`,
        userId: '42',
        conversationId: 'conv-1',
        toolName: 'create_event',
        argsHash: 'hash',
        resultType: 'event',
        resultId: opts.eventId,
        afterSnapshot,
        revokeClass: 'local_compensate',
        revokeStatus: null,
        compensationGroup: opts.group ?? null,
        parentEffectId: opts.parentEffectId ?? null,
      }),
    );
  };

  const build = (withCaptor: boolean): AiToolEffectsService =>
    new AiToolEffectsService(
      effects() as never,
      new LocalEntityRevoker(ds.manager) as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      withCaptor ? (new SideEffectSnapshotCaptor(ds.manager) as never) : undefined,
    );

  /** 管理端列表里那一行的读数（REV-14 的露出面）。 */
  const comparabilityOf = async (
    effectId: number,
  ): Promise<{ promised: unknown[]; uncomparable: unknown[] } | null> => {
    const page = await svc.list({ limit: 100 });
    const row = page.items.find((r) => r.id === effectId) as
      | { revokeComparability?: { promised: unknown[]; uncomparable: unknown[] } | null }
      | undefined;
    return row?.revokeComparability ?? null;
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect, Event],
      synchronize: true,
    });
    await ds.initialize();
    svc = build(true);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('**主判据**：目标行已不在（承诺可比、实际比不到）→ 撤销仍读作 complete，而差集在之后仍可见', async () => {
    await events().save(events().create({ id: 1, title: '产品评审', userId: 42 } as never));
    const effect = await seedEffect({ eventId: 1 });

    // 撤销之前目标行被**硬删**（不是软删）——重读只能得到 row_missing
    await ds.query(`DELETE FROM "events" WHERE "id" = 1`);

    const r = await svc.revoke(effect.id);

    // 判定照旧读作完成：本项**不**改判定（这是发现，不是裁决）
    expect(r?.revoked).toBe(true);
    expect(r?.revokeStatus).toBe('revoked');

    // 而「被声明为可比、后来发现不可比」的那一个集合，在完成之后仍然读得到
    const gap = await comparabilityOf(effect.id);
    expect(gap).not.toBeNull();
    expect(gap?.promised).toEqual([{ resultType: 'event', resultId: 1 }]);
    expect(gap?.uncomparable).toEqual([
      { resultType: 'event', resultId: 1, reason: 'row_missing' },
    ]);
  });

  it('反向对照：一切可比 → 撤销完成，且**不产生**该读数', async () => {
    await events().save(events().create({ id: 1, title: '产品评审', userId: 42 } as never));
    const effect = await seedEffect({ eventId: 1 });

    const r = await svc.revoke(effect.id);

    expect(r?.revoked).toBe(true);
    expect(await comparabilityOf(effect.id)).toBeNull();
  });

  it('反向对照：比过就算比到了——**漂移**不是「不可比」，不落进这个差集', async () => {
    await events().save(events().create({ id: 1, title: '产品评审', userId: 42 } as never));
    const effect = await seedEffect({ eventId: 1 });

    // 有人改过内容：REV-9 的漂移（读到了、发现不同），**不是** REV-14 的「没比到」
    await ds.query(`UPDATE "events" SET "title" = '别人改过的标题' WHERE "id" = 1`);

    const r = await svc.revoke(effect.id);

    expect(r?.revoked).toBe(true);
    expect(r?.message).toContain('写入后被改过'); // REV-9 的既有读数仍在
    expect(await comparabilityOf(effect.id)).toBeNull(); // 而这一项不产生读数
  });

  it('反向对照：没有捕获器 → 什么都没承诺，无从谈「承诺被打破」', async () => {
    await events().save(events().create({ id: 1, title: '产品评审', userId: 42 } as never));
    const effect = await seedEffect({ eventId: 1 });
    const noCaptor = build(false);

    await ds.query(`DELETE FROM "events" WHERE "id" = 1`);

    const r = await noCaptor.revoke(effect.id);
    const page = await noCaptor.list({ limit: 100 });
    const row = page.items.find((x) => x.id === effect.id) as
      | { revokeComparability?: unknown }
      | undefined;

    expect(r?.revoked).toBe(true);
    expect(row?.revokeComparability ?? null).toBeNull();
  });

  it('组：差集落在**组根行**上（一份证据，不逐行复制），组级判定仍读作 complete', async () => {
    await events().save([
      events().create({ id: 1, title: 'A', userId: 42 } as never),
      events().create({ id: 2, title: 'B', userId: 42 } as never),
    ] as never);
    const root = await seedEffect({ eventId: 1, group: 'grp-rev14' });
    const child = await seedEffect({ eventId: 2, group: 'grp-rev14', parentEffectId: root.id });

    // 只让**第二个成员**的目标行消失
    await ds.query(`DELETE FROM "events" WHERE "id" = 2`);

    const r = await svc.revoke(root.id);

    expect(r?.revoked).toBe(true);
    expect(r?.cascade).toEqual({
      groupId: 'grp-rev14',
      total: 2,
      revoked: 2,
      skipped: 0,
      failed: 0,
    });

    const gap = await comparabilityOf(root.id);
    expect(gap?.promised).toEqual([
      { resultType: 'event', resultId: 1 },
      { resultType: 'event', resultId: 2 },
    ]);
    expect(gap?.uncomparable).toEqual([
      { resultType: 'event', resultId: 2, reason: 'row_missing' },
    ]);
    // 子行上没有第二份副本（证据只住一处）
    expect(await comparabilityOf(child.id)).toBeNull();
  });

  it('串行两轮：读数跟随**最近一次**比对，陈旧的差集不会留在行上', async () => {
    await events().save(events().create({ id: 1, title: '产品评审', userId: 42 } as never));
    const effect = await seedEffect({ eventId: 1 });

    // 第一轮：目标不在 → 差集落库
    await ds.query(`DELETE FROM "events" WHERE "id" = 1`);
    await svc.revoke(effect.id);
    expect(await comparabilityOf(effect.id)).not.toBeNull();

    // 第二轮：目标回来了（回收站恢复的等价形态）→ 这一次真的比到了 ⇒ 旧读数必须被清掉
    await events().save(events().create({ id: 1, title: '产品评审', userId: 42 } as never));
    await ds.query(
      `UPDATE "ai_tool_side_effects" SET "revoke_status" = NULL WHERE "id" = ${effect.id}`,
    );
    const again = await svc.revoke(effect.id);

    expect(again?.revoked).toBe(true);
    expect(await comparabilityOf(effect.id)).toBeNull();
  });
});
