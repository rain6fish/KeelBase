import { defineStore } from 'pinia'
import { eventsService } from '../services/events-service'
import type { EventItem, CreateEventRequest } from '../types/event'

/** 事件状态（DX-3，Taro→Vue3 迁移：zustand → pinia）：范围加载 + 增删 + 错误清理。 */
export const useEventsStore = defineStore('events', {
  state: () => ({
    events: [] as EventItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async loadEvents(start: string, end: string) {
      this.isLoading = true
      this.error = null
      try {
        this.events = await eventsService.getEventsForRange(start, end)
      } catch (err: any) {
        this.error = err.message || 'Failed to load events'
      } finally {
        this.isLoading = false
      }
    },

    async createEvent(dto: CreateEventRequest): Promise<boolean> {
      try {
        await eventsService.create(dto)
        return true
      } catch (err: any) {
        this.error = err.message || 'Failed to create event'
        return false
      }
    },

    async deleteEvent(id: number): Promise<boolean> {
      try {
        await eventsService.remove(id)
        this.events = this.events.filter((e) => e.id !== id)
        return true
      } catch (err: any) {
        this.error = err.message || 'Failed to delete event'
        return false
      }
    },

    clearError() {
      this.error = null
    },
  },
})
