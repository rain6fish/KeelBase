// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { storage } from '../utils/storage'
import { STORAGE_KEYS } from '../utils/constants'

export type ThemeMode = 'light' | 'dark' | 'system'

/** 主题模式（Taro→Vue3 迁移：zustand → pinia）：亮/暗/跟随系统，持久化到本地存储。 */
export const useThemeStore = defineStore('theme', {
  state: () => ({
    themeMode: 'system' as ThemeMode,
  }),
  actions: {
    async initialize() {
      const stored = await storage.get<string>(STORAGE_KEYS.THEME_MODE)
      const mode = stored === 'light' || stored === 'dark' ? stored : 'system'
      this.themeMode = mode as ThemeMode
    },

    async setThemeMode(mode: ThemeMode) {
      this.themeMode = mode
      await storage.set(STORAGE_KEYS.THEME_MODE, mode)
    },

    async toggle() {
      const next = this.themeMode === 'dark' ? 'light' : 'dark'
      await this.setThemeMode(next)
    },
  },
})
