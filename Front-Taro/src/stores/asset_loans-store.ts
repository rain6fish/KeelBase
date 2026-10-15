// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { asset_loansService } from '../services/asset_loans-service'
import { translate } from '../i18n/translate'
import type { AssetLoanItem, CreateAssetLoanRequest } from '../types/asset_loans'

/** 资产借用状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const useAssetLoansStore = defineStore('asset_loans', {
  state: () => ({
    items: [] as AssetLoanItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await asset_loansService.getAssetLoans()
      } catch (err: any) {
        this.error = err.message || translate('asset_loans.loadFailed')
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreateAssetLoanRequest) {
      const item = await asset_loansService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await asset_loansService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || translate('asset_loans.deleteFailed'))
      }
    },
  },
})
