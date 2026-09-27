// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { followup_plansService } from '../services/followup_plans-service'
import type { FollowupPlanItem, CreateFollowupPlanRequest } from '../types/followup_plans'

/** 跟进计划状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const useFollowupPlansStore = defineStore('followup_plans', {
  state: () => ({
    items: [] as FollowupPlanItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await followup_plansService.getFollowupPlans()
      } catch (err: any) {
        this.error = err.message || 'Failed to load 跟进计划'
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreateFollowupPlanRequest) {
      const item = await followup_plansService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await followup_plansService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || 'Failed to delete followup_plan')
      }
    },
  },
})
