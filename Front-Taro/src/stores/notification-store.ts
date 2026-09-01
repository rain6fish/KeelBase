// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { notificationService } from '../services/notification-service'
import { wsClient } from '../services/ws-client'
import { translate } from '../i18n/translate'
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
        this.error = err.message || translate('notifications.loadFailed')
        this.isLoading = false
      }
    },

    async markRead(id: number) {
      try {
        await notificationService.markRead(id)
      } catch (err: any) {
        // CR-26：fire-and-forget 调用防未捕获 rejection
        this.error = err?.message || translate('notifications.markReadFailed')
        return
      }
      this.notifications = this.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n,
      )
      this.unreadCount = Math.max(0, this.unreadCount - 1)
    },

    async markAllRead() {
      try {
        await notificationService.markAllRead()
      } catch (err: any) {
        this.error = err?.message || translate('notifications.markAllReadFailed')
        return
      }
      this.notifications = this.notifications.map((n) => ({ ...n, isRead: true }))
      this.unreadCount = 0
    },

    async remove(id: number) {
      try {
        await notificationService.deleteNotification(id)
      } catch (err: any) {
        this.error = err?.message || translate('notifications.deleteFailed')
        return
      }
      this.notifications = this.notifications.filter((n) => n.id !== id)
    },

    /** RG-6：连接 WS 实时通道，新通知实时插入列表（REST 轮询保留为降级）。 */
    initRealtime() {
      wsClient.connect()
      wsClient.onMessage((msg) => {
        if (msg.event !== 'notification') return
        const n = msg.data as NotificationItem
        this.notifications = [n, ...this.notifications]
        this.unreadCount++
      })
    },
  },
})
