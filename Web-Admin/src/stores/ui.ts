import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/constants'

type Theme = 'light' | 'dark'

function initialTheme(): Theme {
  const saved = storage.get(STORAGE_KEYS.THEME)
  if (saved === 'light' || saved === 'dark') return saved
  if (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches) return 'dark'
  return 'light'
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    drawer: true as boolean,
    theme: initialTheme() as Theme,
  }),
  actions: {
    toggleDrawer() {
      this.drawer = !this.drawer
    },
    setTheme(theme: Theme) {
      this.theme = theme
      storage.set(STORAGE_KEYS.THEME, theme)
    },
    toggleTheme() {
      this.setTheme(this.theme === 'light' ? 'dark' : 'light')
    },
  },
})
