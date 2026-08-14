import { defineStore } from 'pinia'
import { notificationService } from '../services/notification-service'
import type { NotificationItem } from '../types/notification'

/** 通知状态（Taro→Vue3 迁移：zustand → pinia）：分页加载 + 已读/全部已读/删除。 */
export const useNotificationStore = defineStore('notification', {
  state: () => ({
    notifications: [] as NotificationItem[],
    unreadCount: 0,
    isLoading: false,
    hasMore: true,
    error: null as string | null,
  }),
  actions: {
    async load(refresh = false) {
      if (this.isLoading) return
      const page = refresh ? 1 : Math.floor(this.notifications.length / 20) + 1
      this.isLoading = true
      this.error = null
      try {
        const result = await notificationService.getNotifications(page, 20)
        this.notifications = refresh
          ? result.items
          : [...this.notifications, ...result.items]
        this.unreadCount = await notificationService.getUnreadCount()
        this.isLoading = false
        this.hasMore = page * 20 < result.total
      } catch (err: any) {
        this.error = err.message || 'Failed to load notifications'
        this.isLoading = false
      }
    },

    async markRead(id: number) {
      await notificationService.markRead(id)
      this.notifications = this.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n,
      )
      this.unreadCount = Math.max(0, this.unreadCount - 1)
    },

    async markAllRead() {
      await notificationService.markAllRead()
      this.notifications = this.notifications.map((n) => ({ ...n, isRead: true }))
      this.unreadCount = 0
    },

    async remove(id: number) {
      await notificationService.deleteNotification(id)
      this.notifications = this.notifications.filter((n) => n.id !== id)
    },
  },
})
