// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import {
  Column,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { LocalEntityRevoker } from './side-effect-revoker';

/**
 * ARC-1：「撤销 → 回收站恢复 → 再撤销」这条**往返**不得报完成，而目标仍活着。
 *
 * 幂等判据此前只看 `revoke_status === 'revoked'`，而读侧 `isRestored` 要求「revoked **且** 目标仍未软删」
 * ——**同一条状态、两条路两个结论**：一条撤销后从回收站恢复的行（目标又活了），撤销侧仍报
 * `already_revoked`（即 `revoked:true`），而列表侧早已按 `targetSoftDeleted` 把它读成 `executed`。
 * 于是用户看到「已撤销」，而那条业务动作**活着**。RC-3 的回收站恢复**只清 `deletedAt`、不动
 * `revoke_status`**（docs/cascade-compensation.spec.md），所以这个组合是真实可达的，不是假想。
 *
 * 本组用例钉的是**旧实现不可能产出的观测面**：第 2 条断言「再撤销之后目标**重新是软的**」——
 * 旧实现走幂等跳过，根本不会去软删，故对旧实现为红。第 1、3 条是反向对照：它们要求这次改动**不误伤**
 * （真已完成的仍跳过；外部行的占位目标不得被读成「活着」而触发重复补偿）。
 *
 * 用真 sqlite + 真撤销器：软删状态是真的，不是 mock 出来的。
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

describe('ARC-1 已恢复行再撤销：不得报完成而目标仍活着', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;
  const effects = () => ds.getRepository(AiToolSideEffect);
  const events = () => ds.getRepository(Event);

  const build = (externalRevoker?: unknown): AiToolEffectsService =>
    new AiToolEffectsService(
      effects() as never,
      new LocalEntityRevoker(ds.manager) as never,
      externalRevoker as never,
    );

  const seedEffect = async (over: Partial<AiToolSideEffect> = {}): Promise<AiToolSideEffect> => {
    await events().save(events().create({ id: 1, title: 'E1' } as never));
    return effects().save(
      effects().create({
        idempotencyKey: 'key-1',
        userId: '42',
        conversationId: 'conv-1',
        toolName: 'create_event',
        argsHash: 'hash',
        resultType: 'event',
        resultId: 1,
        revokeClass: 'local_compensate',
        revokeStatus: null,
        ...over,
      }),
    );
  };

  /** 目标当前的软删时刻（null = 活着）。`withDeleted` 是必须的：默认查询会滤掉软删行。 */
  const targetDeletedAt = async (): Promise<Date | null> => {
    const row = await events().findOne({ where: { id: 1 }, withDeleted: true });
    return row?.deletedAt ?? null;
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
    await ds.destroy();
  });

  it('反向对照：已撤销 **且目标仍软删** → 仍走幂等跳过（不重复补偿）', async () => {
    const effect = await seedEffect();
    await svc.revoke(effect.id);
    expect(await targetDeletedAt()).not.toBeNull();

    const again = await svc.revoke(effect.id);

    expect(again?.skipped).toBe(true);
    expect(again?.reason).toBe('already_revoked');
    expect(again?.revoked).toBe(true); // 真已完成 ⇒ 幂等成功（HTTP DELETE 语义）
  });

  it('往返：撤销 → 回收站恢复 → 再撤销 → **真的再撤一次**（目标重新软删），不报「已完成」了事', async () => {
    const effect = await seedEffect();
    await svc.revoke(effect.id);
    expect(await targetDeletedAt()).not.toBeNull();

    // 回收站恢复：只清 deletedAt，不动 revoke_status（RC-3 的既定语义）
    await ds.query(`UPDATE "events" SET "deleted_at" = NULL WHERE "id" = 1`);
    expect(await targetDeletedAt()).toBeNull();

    const second = await svc.revoke(effect.id);

    // 旧实现：这里走幂等跳过 → 报 revoked:true，而目标**仍是活的**。现在必须真的再撤一次。
    expect(second?.skipped).toBeFalsy();
    expect(second?.revoked).toBe(true);
    expect(await targetDeletedAt()).not.toBeNull();
  });

  it('反向对照：外部（B 路径）行的占位目标不得被读成「活着」→ 仍按已完成跳过，不重复外呼', async () => {
    const externalRevoker = { revoke: jest.fn() };
    svc = build(externalRevoker);
    // describeTarget 对外部 resultType 返回占位 { deletedAt: null }（「撤销语义在外部」，不是「目标活着」）
    const effect = await seedEffect({
      resultType: 'proxy_call',
      revokeClass: 'governed_external',
      revokeStatus: 'revoked',
    });

    const res = await svc.revoke(effect.id);

    expect(res?.skipped).toBe(true);
    expect(res?.reason).toBe('already_revoked');
    expect(externalRevoker.revoke).not.toHaveBeenCalled();
  });
});
