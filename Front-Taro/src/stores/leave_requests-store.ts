// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { leave_requestsService } from '../services/leave_requests-service'
import { translate } from '../i18n/translate'
import type { LeaveRequestItem, CreateLeaveRequestRequest } from '../types/leave_requests'

/** 请假申请状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const useLeaveRequestsStore = defineStore('leave_requests', {
  state: () => ({
    items: [] as LeaveRequestItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await leave_requestsService.getLeaveRequests()
      } catch (err: any) {
        this.error = err.message || translate('leave_requests.loadFailed')
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreateLeaveRequestRequest) {
      const item = await leave_requestsService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await leave_requestsService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || translate('leave_requests.deleteFailed'))
      }
    },
  },
})
