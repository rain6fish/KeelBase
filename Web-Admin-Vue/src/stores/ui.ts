import { defineStore } from 'pinia'
import { storage } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/constants'
import { isThemeVariant, type ThemeMode, type ThemeVariant } from '@/utils/theme'

function initialTheme(): ThemeMode {
  const saved = storage.get(STORAGE_KEYS.THEME)
  if (saved === 'light' || saved === 'dark') return saved
  if (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches) return 'dark'
  return 'light'
}

function initialVariant(): ThemeVariant {
  const saved = storage.get(STORAGE_KEYS.THEME_VARIANT)
  return isThemeVariant(saved) ? saved : 'navy'
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    drawer: true as boolean,
    theme: initialTheme() as ThemeMode,
    variant: initialVariant() as ThemeVariant,
  }),
  actions: {
    toggleDrawer() {
      this.drawer = !this.drawer
    },
    setTheme(theme: ThemeMode) {
      this.theme = theme
      storage.set(STORAGE_KEYS.THEME, theme)
    },
    toggleTheme() {
      this.setTheme(this.theme === 'light' ? 'dark' : 'light')
    },
    setVariant(variant: ThemeVariant) {
      this.variant = variant
      storage.set(STORAGE_KEYS.THEME_VARIANT, variant)
    },
  },
})
