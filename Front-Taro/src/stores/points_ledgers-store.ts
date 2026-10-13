// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { points_ledgersService } from '../services/points_ledgers-service'
import { translate } from '../i18n/translate'
import type { PointsLedgerItem, CreatePointsLedgerRequest } from '../types/points_ledgers'

/** 积分台账状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const usePointsLedgersStore = defineStore('points_ledgers', {
  state: () => ({
    items: [] as PointsLedgerItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await points_ledgersService.getPointsLedgers()
      } catch (err: any) {
        this.error = err.message || translate('points_ledgers.loadFailed')
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreatePointsLedgerRequest) {
      const item = await points_ledgersService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await points_ledgersService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || translate('points_ledgers.deleteFailed'))
      }
    },
  },
})
