 import { api } from './api-client'
 import type { PaginatedList } from '../types/api'
 import type { NotificationItem } from '../types/notification'

 export const notificationService = {
   async getNotifications(page = 1, limit = 20): Promise<PaginatedList<NotificationItem>> {
     const res = await api.get<PaginatedList<NotificationItem>>('/notifications', { page, limit })
     return res.data!
   },

   async getUnreadCount(): Promise<number> {
     const res = await api.get<{ count: number }>('/notifications/unread-count')
     return res.data?.count ?? 0
   },

   async markRead(id: number): Promise<void> {
     await api.patch(`/notifications/${id}/read`)
   },

   async markAllRead(): Promise<void> {
     await api.patch('/notifications/read-all')
   },

   async deleteNotification(id: number): Promise<void> {
     await api.delete(`/notifications/${id}`)
   },
 }
