// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { provenanceService, type AppProvenance } from '../services/provenance-service'

/**
 * FE-1：拉取 `/app/provenance` 供设置页展示运行时来源指纹。
 * 未加载/失败 → null（展示端隐藏该行）。
 */
export const useProvenanceStore = defineStore('provenance', {
  state: () => ({
    provenance: null as AppProvenance | null,
    loaded: false,
  }),
  actions: {
    async load() {
      if (this.loaded) return
      try {
        this.provenance = await provenanceService.get()
      } catch {
        // 失败保持 null → 隐藏
      }
      this.loaded = true
    },
  },
})
