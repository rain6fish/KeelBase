// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { Column, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { LocalEntityRevoker } from './side-effect-revoker';

/**
 * ARC-6：争议判据与**危害模型**对齐 ＋ 标记**有解除路径**。
 *
 * 此前任一侧差集非空即判「声明与持有不一致」⇒ 一次「重试声明**更少**」就把一个**已完全撤销**的组
 * **永久**读成「未完成」（标记只写不清，全仓无清除点）。而危害只在一侧：「**声明了却从未登记**」的成员
 * 撤销够不到；`onlyStored`（持有有、声明无）那几条**已被登记、会被补偿**，报未完成是假警报。
 *
 * 裁决（用户 2026-09-27）：判据**只认 `onlyDeclared`**（证据两侧照旧都留）；解除路径取**管理端显式确认**
 * ——「声明了却从未登记」的成员按构造**补不上**（重试撞键只回放既有组），自动清除会把谎话写进状态，
 * 而「有人看过了」是人能给出的真信息。确认**解除「未了结」，证据原样保留**。
 *
 * 红证据：第 1 条对旧实现为红（旧实现给 `revoked:false`），第 3 条对旧实现为红（旧实现没有「确认」这回事）。
 * 第 2 条是**反向对照**（危害方向仍须拦住，两版皆绿）——没有它，一个「什么都不判」的实现也能过。
 *
 * 用真 sqlite：不一致经**真实唯一冲突**路径产生，确认写库也是真的。
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

const CTX = {
  userId: '42',
  conversationId: 'conv-1',
  toolName: 'create_project_with_tasks',
  args: { title: 'X' },
};

describe('ARC-6 争议判据与解除路径', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;
  const effects = () => ds.getRepository(AiToolSideEffect);

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect, Event],
      synchronize: true,
    });
    await ds.initialize();
    svc = new AiToolEffectsService(
      effects() as never,
      new LocalEntityRevoker(ds.manager) as never,
      undefined,
      undefined,
      undefined,
      undefined,
      ds,
    );
    await ds.getRepository(Event).save([
      { id: 1, title: 'E1' },
      { id: 2, title: 'E2' },
      { id: 3, title: 'E3' },
    ]);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  const rootRow = async () => effects().findOneByOrFail({ idempotencyKey: AiToolEffectsService.buildKey(CTX) });
  const evidenceOf = async (id: number) =>
    JSON.parse((await effects().findOneByOrFail({ id })).revokeDispute ?? 'null') as {
      onlyDeclared: unknown[];
      onlyStored: unknown[];
      acknowledgedAt?: string;
      acknowledgedBy?: string;
    } | null;

  it('「重试声明更少」（只有 onlyStored）→ 证据照旧留，但**不再判未完成**', async () => {
    await svc.recordGroup(CTX, [
      { resultType: 'event', resultId: 1 },
      { resultType: 'event', resultId: 2 },
    ]);
    const root = await rootRow();

    // 重试少声明一条：撞基键 → 回放既有组 → 差异被记下（REV-1 的「留证」不变）
    await svc.recordGroup(CTX, [{ resultType: 'event', resultId: 1 }]);
    const evidence = await evidenceOf(root.id);
    expect(evidence!.onlyDeclared).toEqual([]);
    expect(evidence!.onlyStored).toEqual([{ resultType: 'event', resultId: 2 }]);

    const res = await svc.revoke(root.id);

    // 那一批**已被登记、会被补偿** ⇒ 不该报「未完成」（旧实现此处为 false，故本条为红）
    expect(res?.revoked).toBe(true);
    expect(res?.message ?? '').not.toContain('声明与持有不一致');
  });

  it('反向对照：「声明多于持有」（onlyDeclared 非空）→ 仍然拦住，不报完成', async () => {
    await svc.recordGroup(CTX, [{ resultType: 'event', resultId: 1 }]);
    const root = await rootRow();
    await svc.recordGroup(CTX, [
      { resultType: 'event', resultId: 1 },
      { resultType: 'event', resultId: 3 },
    ]);
    expect((await evidenceOf(root.id))!.onlyDeclared).toEqual([{ resultType: 'event', resultId: 3 }]);

    const res = await svc.revoke(root.id);

    expect(res?.revoked).toBe(false);
    expect(res?.message).toContain('声明与持有不一致');
  });

  it('显式确认：解除「未了结」→ 撤销不再被拦，而**证据与确认人/时刻都还在**', async () => {
    await svc.recordGroup(CTX, [{ resultType: 'event', resultId: 1 }]);
    const root = await rootRow();
    await svc.recordGroup(CTX, [
      { resultType: 'event', resultId: 1 },
      { resultType: 'event', resultId: 3 },
    ]);

    const ack = await svc.acknowledgeDispute(root.id, '7');

    expect(ack.ok).toBe(true);
    const evidence = await evidenceOf(root.id);
    expect(evidence!.onlyDeclared).toEqual([{ resultType: 'event', resultId: 3 }]); // 证据原样保留
    expect(evidence!.acknowledgedBy).toBe('7');
    expect(Number.isNaN(Date.parse(evidence!.acknowledgedAt!))).toBe(false);

    const res = await svc.revoke(root.id);
    expect(res?.revoked).toBe(true);
    expect(res?.message ?? '').not.toContain('声明与持有不一致');
  });

  it('确认是幂等的：再确认返回**原时刻**，不覆盖', async () => {
    await svc.recordGroup(CTX, [{ resultType: 'event', resultId: 1 }]);
    const root = await rootRow();
    await svc.recordGroup(CTX, [
      { resultType: 'event', resultId: 1 },
      { resultType: 'event', resultId: 3 },
    ]);
    const first = await svc.acknowledgeDispute(root.id, '7');

    const second = await svc.acknowledgeDispute(root.id, '9');

    expect(second).toEqual({ ok: true, acknowledgedAt: first.acknowledgedAt });
    expect((await evidenceOf(root.id))!.acknowledgedBy).toBe('7');
  });

  it('没有争议的行 / 不存在的行 → 明确拒绝（不谎报已确认）', async () => {
    await svc.recordGroup(CTX, [{ resultType: 'event', resultId: 1 }]);
    const root = await rootRow();

    expect(await svc.acknowledgeDispute(root.id, '7')).toEqual({ ok: false, reason: 'no_open_dispute' });
    expect(await svc.acknowledgeDispute(99999, '7')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('缺失集合变了 → 上一份确认**不再适用**（新事实按未确认处理，裁决回来）', async () => {
    await svc.recordGroup(CTX, [{ resultType: 'event', resultId: 1 }]);
    const root = await rootRow();
    await svc.recordGroup(CTX, [
      { resultType: 'event', resultId: 1 },
      { resultType: 'event', resultId: 3 },
    ]);
    await svc.acknowledgeDispute(root.id, '7');

    // 又一次不一致，且缺失的是**另一批**成员
    await svc.recordGroup(CTX, [
      { resultType: 'event', resultId: 1 },
      { resultType: 'event', resultId: 2 },
    ]);

    const evidence = await evidenceOf(root.id);
    expect(evidence!.onlyDeclared).toEqual([{ resultType: 'event', resultId: 2 }]);
    expect(evidence!.acknowledgedAt).toBeUndefined(); // 人的确认指的是上一次那批，不是这一批
    const res = await svc.revoke(root.id);
    expect(res?.revoked).toBe(false);
  });
});
