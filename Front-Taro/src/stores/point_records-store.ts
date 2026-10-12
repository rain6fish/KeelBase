// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { point_recordsService } from '../services/point_records-service'
import { translate } from '../i18n/translate'
import type { PointRecordItem, CreatePointRecordRequest } from '../types/point_records'

/** 积分流水状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const usePointRecordsStore = defineStore('point_records', {
  state: () => ({
    items: [] as PointRecordItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await point_recordsService.getPointRecords()
      } catch (err: any) {
        this.error = err.message || translate('point_records.loadFailed')
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreatePointRecordRequest) {
      const item = await point_recordsService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await point_recordsService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || translate('point_records.deleteFailed'))
      }
    },
  },
})
