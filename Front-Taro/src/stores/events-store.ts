// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { eventsService } from '../services/events-service'
import { translate } from '../i18n/translate'
import type { EventItem, CreateEventRequest } from '../types/event'

/** 事件状态（DX-3，Taro→Vue3 迁移：zustand → pinia）：范围加载 + 增删 + 错误清理。 */
export const useEventsStore = defineStore('events', {
  state: () => ({
    events: [] as EventItem[],
    isLoading: false,
    error: null as string | null,
    // A month switch starts a newer load; the earlier response must not
    // overwrite the newly selected range.
    //
    // 切换月份会发起更新的加载；更早的响应不得覆盖新选中的范围。
    loadGeneration: 0,
  }),
  actions: {
    async loadEvents(start: string, end: string) {
      const generation = ++this.loadGeneration
      this.isLoading = true
      this.error = null
      try {
        const events = await eventsService.getEventsForRange(start, end)
        if (generation !== this.loadGeneration) return
        this.events = events
      } catch (err: any) {
        if (generation !== this.loadGeneration) return
        this.error = err.message || translate('events.loadFailed')
      } finally {
        if (generation === this.loadGeneration) this.isLoading = false
      }
    },

    async createEvent(dto: CreateEventRequest): Promise<boolean> {
      try {
        await eventsService.create(dto)
        return true
      } catch (err: any) {
        this.error = err.message || translate('events.createFailed')
        return false
      }
    },

    async deleteEvent(id: number): Promise<boolean> {
      try {
        await eventsService.remove(id)
        this.events = this.events.filter((e) => e.id !== id)
        return true
      } catch (err: any) {
        this.error = err.message || translate('events.deleteFailed')
        return false
      }
    },

    clearError() {
      this.error = null
    },
  },
})
