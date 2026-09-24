// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { capabilitiesApi, type AppCapabilities } from '@/api/capabilities'
import { setCurrencySymbol } from '@/utils/money'

/**
 * MOD-4：管理台按 capabilities 隐藏未启用业务模块的导航/路由。
 * 未加载或失败时默认视为全部开启（不误隐藏）。
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
        this.caps = await capabilitiesApi.get()
        // 服务端是币种符号的权威（契约 v2）；取回即应用，端内常量退居兜底。
        // 取不到 `display`（旧服务端）时 setCurrencySymbol 忽略空值，兜底值继续生效。
        setCurrencySymbol(this.caps?.display?.currencySymbol)
      } catch {
        // 失败保持 null → 默认全开
      }
      this.loaded = true
    },
  },
})
