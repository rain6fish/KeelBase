// SPDX-License-Identifier: Apache-2.0

import type { InjectionKey } from 'vue'

/**
 * Whether the console shell is read-only for the current viewer. `AdminLayout` provides `true` for the
 * audit reader (AW-2); pages that mix reading with admin-only actions inject it and hide the actions.
 * The default (no provider, e.g. a page mounted alone in a spec) is `false`, i.e. the admin rendering.
 *
 * 当前查看者是否只能读。`AdminLayout` 对审计读者（AW-2）提供 `true`；读 / 写混排的页面注入它并
 * 隐藏写操作。无提供者时默认 `false`（管理员渲染），单页挂载的 spec 因此照旧。
 */
export const CONSOLE_READ_ONLY: InjectionKey<boolean> = Symbol('consoleReadOnly')
