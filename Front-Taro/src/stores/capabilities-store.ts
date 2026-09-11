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
      // 未加载/失败/字段缺失或非数组 → 默认可见（fail-open）：不信任原始响应形状，
      // 否则 `businessModules.some` 会在 computed 里抛错、整页渲染崩掉（对齐 provenance-store 的归一做法）。
      if (!Array.isArray(state.caps?.businessModules)) return true
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
