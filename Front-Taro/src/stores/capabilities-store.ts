// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { capabilitiesService, type AppCapabilities } from '../services/capabilities-service'

/**
 * FE-1 / MOD-4：按 `/app/capabilities` 的启用业务模块显隐导航/宫格。
 * 未加载或失败 → 默认全部可见（不误隐藏）。
 */
export const useCapabilitiesStore = defineStore('capabilities', {
  state: () => ({
    caps: null as AppCapabilities | null,
    loaded: false,
  }),
  getters: {
    isModuleEnabled: (state) => (id: string) => {
      if (!state.caps) return true
      return state.caps.businessModules.some((m) => m.id === id)
    },
  },
  actions: {
    async load() {
      if (this.loaded) return
      try {
        this.caps = await capabilitiesService.get()
      } catch {
        // 失败保持 null → 默认全开
      }
      this.loaded = true
    },
  },
})
