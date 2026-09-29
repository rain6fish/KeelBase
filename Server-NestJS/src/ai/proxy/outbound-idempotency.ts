// SPDX-License-Identifier: Apache-2.0

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * ACT-9b: the action key an outbound **write** carries as `Idempotency-Key`, for the duration of one
 * tool execution (docs/ai-agent.spec.md §6.6).
 *
 * The value is the write's **ledger** key — the same `AiToolEffectsService.buildKey` the local side
 * effect row and the execution claim use — so one logical call is one key on both sides, rather than
 * two identities that later have to be reconciled.
 *
 * **Why a scope rather than a parameter.** The place that knows the key (`executeWrite`) is two layers
 * above the place that sends it (`ProxyTool`, reached through `ToolRegistry.execute` → `AiTool.execute`).
 * Widening the tool interface for the single implementation that reads it would charge every tool in the
 * registry for one writer's need, and it is a hot interface besides. A scope is the shape this repo
 * already uses for a cross-cutting fact that belongs to exactly one layer — `writeCapture` carries what
 * was written to the data layer, `actorContext` carries who is acting.
 *
 * **Absent scope ⇒ no header.** A call that never went through the claim path has no action key, and
 * inventing one would send a key nobody agreed on. `getStore()` returning `undefined` is the honest
 * answer; the target then behaves exactly as it does today.
 *
 * ACT-9b：出站**写**在一次工具执行期间携带的 action key（作为 `Idempotency-Key`，docs/ai-agent.spec.md §6.6）。
 *
 * 值就是这次写的**账本**键 —— 与本地副作用行、与执行占位行用的是同一个 `AiToolEffectsService.buildKey`
 * —— 故一次逻辑调用在两侧是同一个键，而不是两个需要事后对账的身份。
 *
 * **为什么用作用域而不是加形参**：知道这个键的地方（`executeWrite`）比发出它的地方（`ProxyTool`，经
 * `ToolRegistry.execute` → `AiTool.execute`）高两层。为一个读它的实现去加宽工具接口，等于让注册表里
 * **每一个**工具替它付账，而那还是个热接口。作用域是本仓给「只属于某一层的横切事实」用的形状 ——
 * `writeCapture` 把「写了什么」送到数据层，`actorContext` 把「谁在执行」送下去。
 *
 * **作用域缺席 ⇒ 不发头**：没走过认领路径的调用没有 action key，而**编一个**会发出一个没人认同的键。
 * `getStore()` 返回 `undefined` 就是诚实的答案；目标的行为与今天完全一致。
 */
export const outboundIdempotencyKey = new AsyncLocalStorage<string>();
