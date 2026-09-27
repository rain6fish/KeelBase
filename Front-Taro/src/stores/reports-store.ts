// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { reportsService } from '../services/reports-service'
import type { ReportItem, CreateReportRequest } from '../types/reports'

/** 报告状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const useReportsStore = defineStore('reports', {
  state: () => ({
    items: [] as ReportItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await reportsService.getReports()
      } catch (err: any) {
        this.error = err.message || 'Failed to load 报告'
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreateReportRequest) {
      const item = await reportsService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await reportsService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || 'Failed to delete report')
      }
    },
  },
})
