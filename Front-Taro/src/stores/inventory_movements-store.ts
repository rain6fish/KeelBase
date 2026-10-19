// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { inventory_movementsService } from '../services/inventory_movements-service'
import { translate } from '../i18n/translate'
import type { InventoryMovementItem, CreateInventoryMovementRequest } from '../types/inventory_movements'

/** 库存出入库状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const useInventoryMovementsStore = defineStore('inventory_movements', {
  state: () => ({
    items: [] as InventoryMovementItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await inventory_movementsService.getInventoryMovements()
      } catch (err: any) {
        this.error = err.message || translate('inventory_movements.loadFailed')
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreateInventoryMovementRequest) {
      const item = await inventory_movementsService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await inventory_movementsService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || translate('inventory_movements.deleteFailed'))
      }
    },
  },
})
