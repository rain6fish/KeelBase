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
 * REV-12：补偿行**指回原始授权决定**。
 *
 * COMPENSATE 审计行此前实载 `{userId, action, method, path, featureKey, targetId,
 * requestBody:{groupId, requestedEffectId, total}, changes, businessEvent}` —— **有组、有成员明细、有 target，
 * 没有「这次撤销依据的是哪次授权」** ⇒「谁许可 / 执行 / 收回」不落在一条链上，要靠证据包另行拼装，
 * **行本身**答不出。
 *
 * 后两条对旧实现为红（旧实现 `requestBody` 里根本没有 `authorization` 这一项）；第 1 条是反向对照
 * ——**单目标撤销不写 COMPENSATE 行**，那是既有口径（只对组级补偿写显式行），断言它没被这次改动带偏。
 *
 * 用真 sqlite + 真撤销器、假 operationAudit（只捕获入参）：被测的是**这行到底带了什么**。
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

type LoggedEntry = {
  action: string;
  requestBody?: string | null;
  targetId?: string | null;
};

describe('REV-12 补偿行指回授权决定', () => {
  let ds: DataSource;
  let logged: LoggedEntry[];
  let svc: AiToolEffectsService;
  const effects = () => ds.getRepository(AiToolSideEffect);

  const build = (): AiToolEffectsService =>
    new AiToolEffectsService(
      effects() as never,
      new LocalEntityRevoker(ds.manager) as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { log: async (e: LoggedEntry) => void logged.push(e) } as never,
    );

  /** 建实体行 + 指向它的副作用行；`runId` 非空即模拟「run 一次授权」产出的成员。 */
  const seed = async (opts: {
    eventId: number;
    group?: string;
    parentEffectId?: number | null;
    runId?: string | null;
    conversationId?: string | null;
  }): Promise<AiToolSideEffect> => {
    await ds.getRepository(Event).save({ id: opts.eventId, title: `E${opts.eventId}` });
    return effects().save(
      effects().create({
        idempotencyKey: `key-${opts.eventId}`,
        userId: '42',
        conversationId: opts.conversationId === undefined ? 'conv-7' : opts.conversationId,
        runId: opts.runId ?? null,
        toolName: 'create_project_with_tasks',
        argsHash: 'hash',
        resultType: 'event',
        resultId: opts.eventId,
        afterSnapshot: JSON.stringify({ id: opts.eventId, title: `E${opts.eventId}` }),
        revokeClass: 'local_compensate',
        revokeStatus: null,
        compensationGroup: opts.group ?? null,
        parentEffectId: opts.parentEffectId ?? null,
      }),
    );
  };

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect, Event],
      synchronize: true,
    });
    await ds.initialize();
    logged = [];
    svc = build();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  const compensationRows = () => logged.filter((e) => e.action === 'COMPENSATE');
  const authorizationOf = (entry: LoggedEntry) =>
    (JSON.parse(entry.requestBody ?? '{}') as { authorization?: Record<string, unknown> })
      .authorization;

  it('反向对照：**单目标**撤销不写 COMPENSATE 行（既有口径：只对组级补偿写显式行）', async () => {
    const e = await seed({ eventId: 1 });

    await svc.revoke(e.id);

    expect(compensationRows()).toHaveLength(0);
  });

  it('run 级授权产出的组：补偿行带那次**决定本身的标识**（runId = run 确认 token）', async () => {
    const root = await seed({ eventId: 1, group: 'grp-a', runId: 'run-token-xyz' });
    await seed({ eventId: 2, group: 'grp-a', parentEffectId: root.id, runId: 'run-token-xyz' });

    await svc.revoke(root.id);

    const rows = compensationRows();
    expect(rows).toHaveLength(1);
    expect(authorizationOf(rows[0])).toEqual({
      conversationId: 'conv-7',
      runId: 'run-token-xyz',
      toolName: 'create_project_with_tasks',
    });
  });

  it('单条确认产出的组：带定位键，且 `runId` 如实为 null（**不编**一个决定标识）', async () => {
    const root = await seed({ eventId: 1, group: 'grp-b' });
    await seed({ eventId: 2, group: 'grp-b', parentEffectId: root.id });

    await svc.revoke(root.id);

    const rows = compensationRows();
    expect(rows).toHaveLength(1);
    expect(authorizationOf(rows[0])).toEqual({
      conversationId: 'conv-7',
      runId: null,
      toolName: 'create_project_with_tasks',
    });
  });

  it('既有的 requestBody 形状未变（groupId / requestedEffectId / total 仍在）', async () => {
    const root = await seed({ eventId: 1, group: 'grp-c' });
    await seed({ eventId: 2, group: 'grp-c', parentEffectId: root.id });

    await svc.revoke(root.id);

    const body = JSON.parse(compensationRows()[0].requestBody ?? '{}') as Record<string, unknown>;
    expect(body).toMatchObject({ groupId: 'grp-c', requestedEffectId: root.id, total: 2 });
  });
});
