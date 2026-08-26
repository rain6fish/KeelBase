import { defineStore } from 'pinia'
import { suppliersService } from '../services/suppliers-service'
import { translate } from '../i18n/translate'
import type { SupplierItem, CreateSupplierRequest } from '../types/suppliers'

/** 供应商状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const useSuppliersStore = defineStore('suppliers', {
  state: () => ({
    items: [] as SupplierItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await suppliersService.getSuppliers()
      } catch (err: any) {
        this.error = err.message || translate('suppliers.loadFailed')
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreateSupplierRequest) {
      const item = await suppliersService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await suppliersService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || translate('suppliers.deleteFailed'))
      }
    },
  },
})
