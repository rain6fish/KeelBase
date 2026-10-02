// SPDX-License-Identifier: Apache-2.0

/**
 * Render a `PresentationText` in the console's current language.
 *
 * The dictionary under `feature` is read directly rather than through vue-i18n's `t()`: these keys
 * contain dots, and `t()` would walk them as a nested path (the same reason `toolLabel` reads the
 * dictionary by hand). A key with no entry falls back to the server's English `fallback`.
 * `ai.present.result.failed` is deliberately one of those: it carries the tool's own error text,
 * which is not ours to reword.
 *
 * Called as a composable so it uses the i18n instance the component was given, not the module
 * singleton — a test that injects its own instance must be able to decide the language.
 *
 * 用管理台当前语言渲染一条 `PresentationText`。
 *
 * 直接查 `feature` 下的字典、不走 vue-i18n 的 `t()`：这些 key 含点号，`t()` 会当嵌套路径去找
 * （与 `toolLabel` 手查字典同一个理由）。没有条目的 key 回落到服务端的英文 `fallback`。
 * `ai.present.result.failed` 是**有意**如此的一条：它带的是工具自己的错误文本，不该由我们改写。
 *
 * 做成组合式，用的就是组件被注入的那个 i18n 实例、而不是模块单例 —— 自带实例的测试必须能决定语言。
 */
import { useI18n } from 'vue-i18n'
import type { PresentationText } from '@/types/presentation'

/** `{name}` 占位符按 `params` 插值；缺参时原样保留占位符（不显示空） */
export function interpolate(template: string, params?: Record<string, string>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in params ? params[key] : whole))
}

export function usePresentText(): (text?: PresentationText | null) => string {
  const { tm } = useI18n()
  return (text) => {
    if (!text) return ''
    const feature = tm('feature') as Record<string, string>
    return interpolate(feature?.[text.key] || text.fallback, text.params)
  }
}
