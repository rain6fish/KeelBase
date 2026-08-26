import { defineStore } from 'pinia'
import { contractsService } from '../services/contracts-service'
import { translate } from '../i18n/translate'
import type { ContractItem, CreateContractRequest } from '../types/contracts'

/** 合同状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const useContractsStore = defineStore('contracts', {
  state: () => ({
    items: [] as ContractItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await contractsService.getContracts()
      } catch (err: any) {
        this.error = err.message || translate('contracts.loadFailed')
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreateContractRequest) {
      const item = await contractsService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await contractsService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || translate('contracts.deleteFailed'))
      }
    },
  },
})
