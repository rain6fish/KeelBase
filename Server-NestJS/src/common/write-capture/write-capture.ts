// SPDX-License-Identifier: Apache-2.0

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * REV-10: capture what a window of code **actually wrote**, at the data layer.
 *
 * Registration has always recorded what the **tool declared**, and nothing has ever observed what
 * actually landed in the tables. So "a tool declares one row and writes ten" could only be discovered
 * later — at revoke time, or on a conflict replay — never at the moment it happened.
 *
 * This is the collection half: a scope you run a window of code inside, plus the writes observed
 * during it. A TypeORM subscriber feeds it; the caller decides what to compare against.
 *
 * **Scoped, and inert outside a scope.** The subscriber fires for every write in the process, so with
 * no active scope it does nothing at all — no allocation, no bookkeeping.
 *
 * REV-10：在数据层捕获一段窗口里**实际写了什么**。
 *
 * 登记层历来只记**工具声明的**东西，而从没有任何地方观察真正落进表里的是什么。于是「工具声明一行、
 * 实际写十行」只能事后——撤销时、或冲突回放时——才发现，从不是**事发当时**。
 *
 * 这里是采集的那一半：一个用来跑某段代码的作用域，以及该作用域内观察到的写。TypeORM 订阅器往里喂，
 * 调用方决定拿它跟什么对差。
 *
 * **有作用域才工作，作用域外完全惰性。** 订阅器对进程里的每一次写都会触发，故没有活动作用域时它
 * 什么都不做——不分配、不记账。
 */
export interface CapturedWrite {
  /** 实体元数据名（类名，如 `Event`）——与 `resolveLocalEntity` 的解析口径同一命名空间 */
  entity: string;
  /** 该行的主键；取不到时为 null（如实记「知道写了这张表，但不知道哪一行」） */
  id: number | string | null;
  /** insert / update / softDelete —— 三者在「账上没有」这件事上是同一件事，但知道是哪种仍有用于读的人 */
  kind: 'insert' | 'update' | 'softDelete';
}

/** 当前窗口的写入收集器；无作用域时 `getStore()` 为 undefined（订阅器据此完全不工作）。 */
export const writeCapture = new AsyncLocalStorage<CapturedWrite[]>();

/**
 * 在一个采集作用域里跑 `fn`，返回它的结果与**该窗口内观察到的写**。
 * 作用域是嵌套安全的（ALS 语义）：内层窗口不会把写记到外层。
 */
export async function withWriteCapture<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; writes: CapturedWrite[] }> {
  const writes: CapturedWrite[] = [];
  const result = await writeCapture.run(writes, fn);
  return { result, writes };
}

/** 订阅器调用它记一笔；无作用域时静默丢弃。 */
export function recordWrite(write: CapturedWrite): void {
  writeCapture.getStore()?.push(write);
}
