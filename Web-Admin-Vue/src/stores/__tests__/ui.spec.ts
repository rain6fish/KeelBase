import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from '@/stores/ui'
import { storage } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/constants'

describe('useUiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    // 默认无系统偏好
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never
  })

  it('默认主题为 light（无存储且系统非深色）', () => {
    const store = useUiStore()
    expect(store.theme).toBe('light')
    expect(store.drawer).toBe(true)
  })

  it('默认主题变体为 purple（深紫）', () => {
    const store = useUiStore()
    expect(store.variant).toBe('purple')
  })

  it('有保存的主题时恢复', () => {
    storage.set(STORAGE_KEYS.THEME, 'dark')
    const store = useUiStore()
    expect(store.theme).toBe('dark')
  })

  it('有保存的主题变体时恢复', () => {
    storage.set(STORAGE_KEYS.THEME_VARIANT, 'graphite')
    const store = useUiStore()
    expect(store.variant).toBe('graphite')
  })

  it('setVariant 更新并持久化', () => {
    const store = useUiStore()
    store.setVariant('teal')
    expect(store.variant).toBe('teal')
    expect(storage.get(STORAGE_KEYS.THEME_VARIANT)).toBe('teal')
  })

  it('toggleDrawer 翻转', () => {
    const store = useUiStore()
    store.toggleDrawer()
    expect(store.drawer).toBe(false)
    store.toggleDrawer()
    expect(store.drawer).toBe(true)
  })

  it('setTheme 更新并持久化', () => {
    const store = useUiStore()
    store.setTheme('dark')
    expect(store.theme).toBe('dark')
    expect(storage.get(STORAGE_KEYS.THEME)).toBe('dark')
  })

  it('toggleTheme 在 light/dark 间切换', () => {
    const store = useUiStore()
    store.toggleTheme()
    expect(store.theme).toBe('dark')
    store.toggleTheme()
    expect(store.theme).toBe('light')
  })
})
