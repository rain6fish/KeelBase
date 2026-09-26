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
 * 都按这个名字解析。真 `Event` 带 `user` 关系，单独注册会把整条依赖链拖进这个 DataSource；而本组用例
 * 只关心「那一行有没有被中间写改过」，所以只要 `id` / 内容列 / 软删列 / 两个记账时间戳。
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
 * REV-9「中间写」：撤销只读「是不是软删了」，不读「**还是不是我写的那条**」。
 *
 * 撤销路径的判据原先**仅** `revokeStatus` 与目标 `deletedAt`（`_skipReason` / `isRestored`），
 * `after_snapshot` 从不参与判定 —— 它只被写入、被展示、被拿去做人读摘要。⇒ AI 写入之后、撤销之前
 * 若有人或别的系统改过该目标行，撤销**照样软删并报成功**，把那次改动一并抹掉，且没有任何提示。
 *
 * 本组用例钉的是**旧实现不可能产出的观测面**：旧实现里没有任何一句话提到「目标被改过」，
 * 故第 2 / 第 4 条对旧实现为红；而第 1 / 第 3 条是**反向对照**——它们要求这项检查**不误报**
 * （没有中间写时不吭声；只有记账时间戳动过时也不吭声）。缺了这两条，一个「凡撤销都喊漂移」的
 * 实现也能通过，而那等于把这次检查用噪音关掉。
 *
 * 用**真 sqlite + 真捕获器 + 真撤销器**：漂移是「重读同一行再比对」的事实，mock 掉任一侧，
 * 被测的就不是这件事了。
 */
describe('REV-9 撤销前的「目标还是不是我写的那条」', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;
  const effects = () => ds.getRepository(AiToolSideEffect);
  const events = () => ds.getRepository(Event);

  /** 建一个实体行 + 一条指向它的副作用行；afterSnapshot 用**真捕获器**产出（与写入时同一形状）。 */
  const seedEffect = async (opts: {
    eventId: number;
    withCaptor: boolean;
    group?: string;
    parentEffectId?: number | null;
  }): Promise<AiToolSideEffect> => {
    const captor = new SideEffectSnapshotCaptor(ds.manager);
    const afterSnapshot = await captor.captureAfter('event', opts.eventId);
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

  it('反向对照：没有中间写 → 撤销照常完成，且**不报**任何漂移', async () => {
    await events().save(events().create({ id: 1, title: '产品评审', userId: 42 } as never));
    const effect = await seedEffect({ eventId: 1, withCaptor: true });

    const r = await svc.revoke(effect.id);

    expect(r?.revoked).toBe(true);
    expect(r?.message ?? '').not.toContain('写入后被改过');
  });

  it('中间写改了内容 → 撤销**仍完成**，但该事实必须可见（不静默抹除）', async () => {
    await events().save(events().create({ id: 1, title: '产品评审', userId: 42 } as never));
    const effect = await seedEffect({ eventId: 1, withCaptor: true });

    // AI 写完之后的中间写：别人改了标题
    await ds.query(`UPDATE "events" SET "title" = '别人改过的标题' WHERE "id" = 1`);

    const r = await svc.revoke(effect.id);

    // 只做「可检出、不静默」：不拒绝、不改判定
    expect(r?.revoked).toBe(true);
    expect(r?.message).toContain('写入后被改过');
    expect(r?.message).toContain('title'); // 点名字段，而不是笼统说「变了」
  });

  it('反向对照：只有 `updatedAt` 动过 → **不算**漂移（否则任何一次触碰都会喊，检查等于被噪音关掉）', async () => {
    await events().save(events().create({ id: 1, title: '产品评审', userId: 42 } as never));
    const effect = await seedEffect({ eventId: 1, withCaptor: true });

    // 只动 ORM 记账列，内容一字未改
    await ds.query(`UPDATE "events" SET "updated_at" = '2099-01-01 00:00:00' WHERE "id" = 1`);

    const r = await svc.revoke(effect.id);

    expect(r?.revoked).toBe(true);
    expect(r?.message ?? '').not.toContain('写入后被改过');
  });

  it('组内本地成员与单条**同判据**：漂移事实并进组级摘要，且不改组级判定', async () => {
    await events().save([
      events().create({ id: 1, title: 'A', userId: 42 } as never),
      events().create({ id: 2, title: 'B', userId: 42 } as never),
    ]);
    const root = await seedEffect({ eventId: 1, withCaptor: true, group: 'grp-rev9' });
    await seedEffect({ eventId: 2, withCaptor: true, group: 'grp-rev9', parentEffectId: root.id });

    // 只改**组内第二个成员**的目标
    await ds.query(`UPDATE "events" SET "title" = 'B 被改过' WHERE "id" = 2`);

    const r = await svc.revoke(root.id);

    expect(r?.revoked).toBe(true); // 漂移不构成拒绝
    expect(r?.message).toContain('写入后被改过');
    expect(r?.message).toContain('title');
  });

  it('没有捕获器 → 判不了就**不报**（不假装未漂移，也不假装漂移）', async () => {
    await events().save(events().create({ id: 1, title: '产品评审', userId: 42 } as never));
    const effect = await seedEffect({ eventId: 1, withCaptor: true });
    const svcNoCaptor = build(false);

    await ds.query(`UPDATE "events" SET "title" = '别人改过的标题' WHERE "id" = 1`);

    const r = await svcNoCaptor.revoke(effect.id);

    expect(r?.revoked).toBe(true);
    expect(r?.message ?? '').not.toContain('写入后被改过');
  });

  it('该行身份本就缺「变更」那半（无 after 快照）→ 无从比对，不报', async () => {
    await events().save(events().create({ id: 1, title: '产品评审', userId: 42 } as never));
    const effect = await seedEffect({ eventId: 1, withCaptor: true });
    await ds.query(`UPDATE "ai_tool_side_effects" SET "after_snapshot" = NULL WHERE "id" = ${effect.id}`);
    await ds.query(`UPDATE "events" SET "title" = '别人改过的标题' WHERE "id" = 1`);

    const r = await svc.revoke(effect.id);

    expect(r?.revoked).toBe(true);
    expect(r?.message ?? '').not.toContain('写入后被改过');
  });
});
