// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from '@/stores/ui'
import { STORAGE_KEYS } from '@/utils/constants'

beforeEach(() => {
  localStorage.clear()
  useUiStore.setState({ drawer: true, theme: 'light' })
})

describe('ui store', () => {
  it('starts with the drawer open', () => {
    expect(useUiStore.getState().drawer).toBe(true)
  })

  it('toggleDrawer flips and is observed through a later getState call', () => {
    useUiStore.getState().toggleDrawer()
    expect(useUiStore.getState().drawer).toBe(false)
    useUiStore.getState().toggleDrawer()
    expect(useUiStore.getState().drawer).toBe(true)
  })

  it('setTheme updates state and persists to localStorage', () => {
    useUiStore.getState().setTheme('dark')
    expect(useUiStore.getState().theme).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBe('dark')
  })

  it('toggleTheme flips and persists on each side', () => {
    useUiStore.getState().toggleTheme()
    expect(useUiStore.getState().theme).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBe('dark')
    useUiStore.getState().toggleTheme()
    expect(useUiStore.getState().theme).toBe('light')
    expect(localStorage.getItem(STORAGE_KEYS.THEME)).toBe('light')
  })
})

describe('ui store initial theme (fresh module boot)', () => {
  async function freshTheme(): Promise<string> {
    vi.resetModules()
    const mod = await import('@/stores/ui')
    return mod.useUiStore.getState().theme
  }

  it('defaults to light when nothing is saved and no dark media is available', async () => {
    expect(await freshTheme()).toBe('light')
  })

  it('boots dark when a dark theme was previously saved', async () => {
    localStorage.setItem(STORAGE_KEYS.THEME, 'dark')
    expect(await freshTheme()).toBe('dark')
  })

  it('falls back to light when the saved theme value is invalid', async () => {
    localStorage.setItem(STORAGE_KEYS.THEME, 'neon')
    expect(await freshTheme()).toBe('light')
  })
})
