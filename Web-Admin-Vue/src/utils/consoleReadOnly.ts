// SPDX-License-Identifier: Apache-2.0

import { inject, provide, type InjectionKey } from 'vue'

/**
 * Read-only switch for console pages shared by an administrator and an audit reader (C-8).
 *
 * The default sits on the **least-privilege** side: a view rendered **outside** the provider's
 * scope is read-only, so a missing provider can never reveal write controls. Only an explicit
 * `provideConsoleReadOnly(false)` opens the write path, and that call belongs to an admin scope.
 *
 * 管理台「只读」开关，供管理员与审计读者共用的页面使用（C-8）。
 *
 * 默认值落在**最小权限**一侧：渲染在 provider 作用域**之外**的视图是只读的，
 * 因此**无 provider 时不得出现写控件**。只有显式的 `provideConsoleReadOnly(false)`
 * 才会打开写路径，而那次调用只应出现在管理员作用域里。
 */
export const CONSOLE_READ_ONLY: InjectionKey<boolean> = Symbol('console-read-only')

/**
 * Read-only value of the current console scope. No provider ⇒ `true` (fail-closed).
 *
 * 当前控制台作用域的只读值。**无 provider ⇒ `true`**（fail-closed）。
 */
export function useConsoleReadOnly(): boolean {
  return inject(CONSOLE_READ_ONLY, true)
}

/**
 * Write permission derived from the read-only switch. No provider ⇒ `false`.
 *
 * 由只读开关派生的写权限。**无 provider ⇒ `false`**。
 */
export function useCanEditConsole(): boolean {
  return !useConsoleReadOnly()
}

/**
 * Provide the switch for a subtree: `true` for read-only (auditor), `false` for full access
 * (admin). Do not use `false` as a fallback outside an explicit admin scope.
 *
 * 为子树提供该开关：只读（审计读者）传 `true`、完全访问（管理员）传 `false`。
 * **不要**在显式管理员作用域之外用 `false` 兜底。
 */
export function provideConsoleReadOnly(readOnly: boolean): void {
  provide(CONSOLE_READ_ONLY, readOnly)
}
