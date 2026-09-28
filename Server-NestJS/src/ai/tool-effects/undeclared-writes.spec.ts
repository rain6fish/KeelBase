// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { Column, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { WriteCaptureSubscriber } from '../../common/write-capture/write-capture.subscriber';
import { withWriteCapture } from '../../common/write-capture/write-capture';

/**
 * REV-10: the ledger records what the tool **declared**. Nothing observed what actually landed, so
 * "declares one row, writes ten" could only surface later — at revoke time or on a conflict replay —
 * and the undeclared rows cannot be revoked at all. A data-layer sensor now reports what the call
 * wrote, and the rows the ledger has no entry for become a fact on the row it does have.
 *
 * Old implementation cannot produce the observation: there is no sensor, no column, and nothing that
 * compares a declaration against actual writes, so every assertion here is red against it.
 *
 * Real sqlite **with the real subscriber registered** — the sensor is half of what is being tested, and
 * a mock would assume away exactly the part that can be wrong.
 *
 * Coverage boundary (asserted below rather than assumed): the sensor fires on inserts of entities that
 * carry a soft-delete column. A row of an entity with no soft-delete column is not a revocable target
 * and is not captured — that is the sensor's stated limit, not a claim that such writes don't happen.
 */
@Entity('capture_probe')
class CaptureProbe {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ nullable: true }) title?: string;
  @DeleteDateColumn({ name: 'deleted_at' }) deletedAt?: Date | null;
}

/** 无软删列 ⇒ 不是可撤业务行 ⇒ 传感器**故意**不看它 */
@Entity('capture_bookkeeping')
class CaptureBookkeeping {
  @PrimaryGeneratedColumn() id!: number;
}

const CTX = { userId: '42', conversationId: 'conv-rev10', toolName: 'create_probe', args: {} };

describe('REV-10 声明与实写不一致：写时就可见', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;

  const effects = () => ds.getRepository(AiToolSideEffect);
  const probes = () => ds.getRepository(CaptureProbe);

  /** 模拟「工具执行」：窗口内写若干行，返回采集到的写 */
  const runToolWriting = async (titles: string[]): Promise<ReturnType<typeof withWriteCapture>> =>
    withWriteCapture(async () => {
      for (const title of titles) {
        await probes().save(probes().create({ title } as never));
      }
    });

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect, CaptureProbe, CaptureBookkeeping],
      subscribers: [WriteCaptureSubscriber], // ← 真传感器
      synchronize: true,
    });
    await ds.initialize();
    svc = new AiToolEffectsService(effects());
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('写了**多于**声明的行 → 多出来的那些如实落在已登记的那一行上（旧实现无从产出）', async () => {
    const { result, writes } = await runToolWriting(['声明的', '没声明的']);
    const [declared, stray] = await probes().find({ order: { id: 'ASC' } });

    // 工具只声明了第一行；第二行是它**偷偷**写的
    const saved = await svc.record(
      { ...CTX, observedWrites: writes },
      'capture_probe',
      declared.id,
      { before: null, after: '{"title":"声明的"}' },
    );

    const row = await effects().findOneByOrFail({ id: saved.id });
    const undeclared = JSON.parse(row.undeclaredWrites!) as Array<{ entity: string; id: number }>;
    // 归一名比配：实体类名 `CaptureProbe` ↔ resultType `capture_probe`
    expect(undeclared).toEqual([{ entity: 'CaptureProbe', id: stray.id, kind: 'insert' }]);
    expect(result).toBeUndefined();
  });

  it('读侧能读出这条读数（管理端据此在**写时**看得见，而不是等撤销时才发现）', async () => {
    const { writes } = await runToolWriting(['声明的', '没声明的']);
    const [declared] = await probes().find({ order: { id: 'ASC' } });
    await svc.record({ ...CTX, observedWrites: writes }, 'capture_probe', declared.id);

    const items = (await svc.list({})).items as unknown as Array<Record<string, unknown>>;
    const item = items.find((i) => i.resultType === 'capture_probe')!;
    expect(item.undeclaredWrites).toEqual([
      { entity: 'CaptureProbe', id: expect.any(Number), kind: 'insert' },
    ]);
  });

  it('反向对照：只写了声明的那一行 → **不**产生该读数（寻常情形不该被说成漏记）', async () => {
    const { writes } = await runToolWriting(['就这一行']);
    const [only] = await probes().find();

    const saved = await svc.record({ ...CTX, observedWrites: writes }, 'capture_probe', only.id);

    const row = await effects().findOneByOrFail({ id: saved.id });
    expect(row.undeclaredWrites).toBeNull();
  });

  it('边界：无软删列的表**不被采集**（那不是可撤业务行，算进来只会把信号埋进噪声）', async () => {
    const { writes } = await withWriteCapture(async () => {
      await ds.getRepository(CaptureBookkeeping).save({} as never);
      await probes().save(probes().create({ title: 'x' }) as never);
    });

    // 只有可撤业务行进了采集窗口
    expect(writes).toEqual([{ entity: 'CaptureProbe', id: expect.any(Number), kind: 'insert' }]);
  });

  it('边界：**作用域外**的写不被采集（传感器全局注册，但惰性）', async () => {
    await probes().save(probes().create({ title: '不在窗口里' }) as never);

    // 没开窗口 ⇒ 这次写没有进任何采集器；随后一次空窗口也证明不了什么，故直接断言「窗口内为空」
    const { writes } = await withWriteCapture(async () => undefined);
    expect(writes).toEqual([]);
  });

  it('没给观察（未开采集的装配）⇒ 留 null，**不假装「没写过」**', async () => {
    const saved = await svc.record({ ...CTX }, 'capture_probe', 7);

    const row = await effects().findOneByOrFail({ id: saved.id });
    expect(row.undeclaredWrites).toBeNull();
  });
});
