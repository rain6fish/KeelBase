// SPDX-License-Identifier: Apache-2.0

/**
 * AW-14 — the execution context that carries a cancellation signal.
 *
 * The executor already accepts `opts.signal` (AW-18). Threading that parameter through every caller
 * would mean touching the chat loop, the plan/sub-agent step executor and the R4 retry path, and any
 * later entry point would have to remember it again. Instead the entry point opens a scope for the
 * turn, and the executor reads the signal from here when its caller did not pass one explicitly.
 * An explicit `opts.signal` always wins — a caller that names a signal is never overridden by ambient
 * state.
 *
 * This mirrors `governance-shared/actor-context.ts`: request-scoped facts that every layer below may
 * need, set once at the boundary, read once at the boundary that acts on them.
 *
 * AW-14 —— 承载取消信号的**执行上下文**。
 *
 * 执行器已经接受 `opts.signal`（AW-18）。把这个形参一路穿过每个调用方，意味着同时改对话主循环、
 * plan/子代理执行器与 R4 重试路径，而且以后每加一个入口都要再记得一次。本模块改为：入口为这一轮开
 * 一个作用域，执行器在调用方**没有显式传**信号时从这里取。显式 `opts.signal` 永远优先 —— 说了用哪个
 * 信号的调用方，不会被环境状态覆盖。
 *
 * 与 `governance-shared/actor-context.ts` 同形：请求级的事实，边界处设一次，真正要动手的那一层读一次。
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface ToolExecutionScope {
  /** The turn's cancellation signal, if the entry point created one. */
  signal?: AbortSignal;
}

export const toolExecutionScope = new AsyncLocalStorage<ToolExecutionScope>();

/** The signal in force for the current execution, if any. */
export function currentToolSignal(): AbortSignal | undefined {
  return toolExecutionScope.getStore()?.signal;
}
