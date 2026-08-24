/**
 * 主题工具：`<html>` 上双轴——`dark` class（亮/暗）+ `data-theme`（indigo/teal/graphite 变体）。
 * 由 App.vue 集中调用（首个 paint 前），保证登录页等任意路由都正确应用。
 */
export type ThemeMode = 'light' | 'dark'
export type ThemeVariant = 'purple' | 'teal' | 'graphite'

export const THEME_VARIANTS: ThemeVariant[] = ['purple', 'teal', 'graphite']

export function isThemeVariant(v: string | null | undefined): v is ThemeVariant {
  return !!v && (THEME_VARIANTS as string[]).includes(v)
}

export function applyTheme(mode: ThemeMode, variant: ThemeVariant): void {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.dataset.theme = variant
}
