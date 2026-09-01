// SPDX-License-Identifier: Apache-2.0

import { create } from 'zustand'
import { storage } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/constants'

type Theme = 'light' | 'dark'

function initialTheme(): Theme {
  const saved = storage.get(STORAGE_KEYS.THEME)
  if (saved === 'light' || saved === 'dark') return saved
  if (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches) return 'dark'
  return 'light'
}

interface UiState {
  drawer: boolean
  theme: Theme
  toggleDrawer: () => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  drawer: true,
  theme: initialTheme(),
  toggleDrawer: () => set((s) => ({ drawer: !s.drawer })),
  setTheme: (theme) => {
    set({ theme })
    storage.set(STORAGE_KEYS.THEME, theme)
  },
  toggleTheme: () => get().setTheme(get().theme === 'light' ? 'dark' : 'light'),
}))
