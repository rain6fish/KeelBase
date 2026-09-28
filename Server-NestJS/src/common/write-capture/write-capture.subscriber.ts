// SPDX-License-Identifier: Apache-2.0

import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm';
import { recordWrite } from './write-capture';

/**
 * REV-10: the sensor. Feeds the active capture scope (if any) with the rows it sees written.
 *
 * **Global and inert.** It is registered on the connection, so it observes every insert in the process —
 * which is the point (an unobserved write is exactly what this is for) — and it does nothing at all
 * unless a scope is open. Two guards, both cheap, in this order:
 *
 * 1. **Not a revocable business row → not this question.** Only entities carrying a soft-delete column
 *    are things the revoker could ever reach (`resolveLocalEntity` requires one), so only those bear on
 *    "did the ledger record everything this action wrote". Bookkeeping tables — audit rows,
 *    notifications, the side-effect ledger itself — are written by plenty of legitimate paths and are
 *    not revocable targets; counting them would bury the signal in noise.
 * 2. **No active scope → no work.** The scope check comes last so the ordinary path pays one
 *    `getStore()` and nothing else.
 *
 * **Coverage boundary, stated rather than implied.** This fires on **inserts** only. Updates are not
 * captured — an `UpdateEvent` carries no stable single id to key on, and matching updates by entity
 * alone would flag every update as unrecorded. Soft-deletes are not captured either: this TypeORM
 * version's subscriber interface offers `afterSoftRemove` (for the `softRemove(entity)` API), while the
 * revoker soft-deletes by id, which does not raise it. And writes issued as **raw SQL**
 * (`queryRunner.query(...)`) raise no subscriber events at all. None of that is a claim that such
 * writes cannot happen — it is what the sensor does not see.
 *
 * REV-10：传感器。把它看见被写下的行喂给当前采集作用域（若有）。
 *
 * **全局且惰性。** 它注册在连接上，故会观察进程里的每一次 insert——这正是要点（**没被观察到的写**正是
 * 本项要抓的东西）——而没有打开作用域时它什么都不做。两道守卫，都便宜，顺序如此：
 *
 * 1. **不是可撤的业务行 ⇒ 与本问题无关。** 只有带软删列的实体才可能被撤销器够到
 *    （`resolveLocalEntity` 就要求这一点），故也只有它们与「这个动作写的东西账上记全了吗」有关。
 *    记账表——审计行、通知、副作用账本本身——被大量合法路径写入，且不是撤销目标；把它们算进来只会把
 *    信号埋进噪声里。
 * 2. **没有活动作用域 ⇒ 不干活。** 作用域判在最后，故寻常路径只付一次 `getStore()`。
 *
 * **覆盖面边界，明说而不暗示。** 本订阅器**只**在 insert 上触发。更新不采——`UpdateEvent` 没有稳定的
 * 单一 id 可作键，而只按实体匹配会把**每一次**更新都报成没记过。软删也不采：本版 TypeORM 的订阅器
 * 接口提供的是 `afterSoftRemove`（对应 `softRemove(entity)` 这个 API），而撤销器是按 id 软删的，
 * 不触发它。以**裸 SQL**（`queryRunner.query(...)`）发出的写则完全不触发订阅器事件。以上都不是「这类写
 * 不会发生」的断言——是**这个传感器看不见什么**。
 */
@EventSubscriber()
export class WriteCaptureSubscriber implements EntitySubscriberInterface {
  afterInsert(event: InsertEvent<unknown>): void {
    if (!event.metadata.deleteDateColumn) return;
    recordWrite({
      entity: event.metadata.name,
      id: extractId(event.entityId, event.entity),
      kind: 'insert',
    });
  }
}

/**
 * 取这一行的主键。`InsertEvent.entityId` 的类型是 `ObjectLiteral`，单个插入时可能是 `{id: 7}` 的形状，
 * 也可能是原样的标量；都取不到时退回实体自身的 `id`，再取不到就**如实给 `null`** ——
 * 「知道写了这张表的某一行，不知道哪一行」仍然是「账上没有」，不该被压掉。
 */
function extractId(entityId: unknown, entity: unknown): number | string | null {
  if (typeof entityId === 'number' || typeof entityId === 'string') return entityId;
  if (entityId && typeof entityId === 'object') {
    const inner = (entityId as Record<string, unknown>).id;
    if (typeof inner === 'number' || typeof inner === 'string') return inner;
  }
  const own = (entity as Record<string, unknown> | null)?.id;
  return typeof own === 'number' || typeof own === 'string' ? own : null;
}
