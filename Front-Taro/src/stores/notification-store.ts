 import { create } from 'zustand'
 import { notificationService } from '../services/notification-service'
 import type { NotificationItem } from '../types/notification'

 interface NotificationState {
   notifications: NotificationItem[]
   unreadCount: number
   isLoading: boolean
   hasMore: boolean
   error: string | null

   load: (refresh?: boolean) => Promise<void>
   markRead: (id: number) => Promise<void>
   markAllRead: () => Promise<void>
   remove: (id: number) => Promise<void>
 }

 export const useNotificationStore = create<NotificationState>((set, get) => ({
   notifications: [],
   unreadCount: 0,
   isLoading: false,
   hasMore: true,
   error: null,

   load: async (refresh = false) => {
     const state = get()
     if (state.isLoading) return
     const page = refresh ? 1 : Math.floor(state.notifications.length / 20) + 1
     set({ isLoading: true, error: null })
     try {
       const result = await notificationService.getNotifications(page, 20)
       set({
         notifications: refresh ? result.items : [...state.notifications, ...result.items],
         unreadCount: await notificationService.getUnreadCount(),
         isLoading: false,
         hasMore: page * 20 < result.total,
       })
     } catch (err: any) {
       set({ error: err.message || 'Failed to load notifications', isLoading: false })
     }
   },

   markRead: async (id) => {
     await notificationService.markRead(id)
     set({
       notifications: get().notifications.map((n) =>
         n.id === id ? { ...n, isRead: true } : n,
       ),
       unreadCount: Math.max(0, get().unreadCount - 1),
     })
   },

   markAllRead: async () => {
     await notificationService.markAllRead()
     set({
       notifications: get().notifications.map((n) => ({ ...n, isRead: true })),
       unreadCount: 0,
     })
   },

   remove: async (id) => {
     await notificationService.deleteNotification(id)
     set({
       notifications: get().notifications.filter((n) => n.id !== id),
     })
   },
 }))
