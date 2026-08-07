 import { useEffect } from 'react'
 import { View, Text, ScrollView } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useNotificationStore } from '../../stores/notification-store'
 import './index.scss'

 export default function NotificationsPage() {
   const { notifications, unreadCount, isLoading, hasMore, load, markRead, markAllRead, remove } = useNotificationStore()

   useEffect(() => {
     load(true)
   }, [])

   const handleMarkAllRead = () => {
     Taro.showModal({
       title: 'Mark All Read',
       content: 'Mark all notifications as read?',
       success: (res) => {
         if (res.confirm) markAllRead()
       },
     })
   }

   const handleDelete = (id: number) => {
     Taro.showModal({
       title: 'Delete',
       content: 'Delete this notification?',
       success: (res) => {
         if (res.confirm) remove(id)
       },
     })
   }

   const formatTime = (iso?: string) => {
     if (!iso) return ''
     const d = new Date(iso)
     const now = new Date()
     const sameDay = d.toDateString() === now.toDateString()
     if (sameDay) {
       return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
     }
     return `${d.getMonth() + 1}/${d.getDate()}`
   }

   return (
     <View className='notifications-page'>
       <View className='notifications-page__header'>
         <Text className='notifications-page__title'>Notifications</Text>
         {notifications.length > 0 && (
           <Text className='notifications-page__mark-all' onClick={handleMarkAllRead}>
             Mark All Read
           </Text>
         )}
       </View>

       {isLoading && notifications.length === 0 ? (
         <View className='notifications-page__loading'>
           <View className='spinner' />
         </View>
       ) : notifications.length === 0 ? (
         <View className='notifications-page__empty'>
           <Text className='notifications-page__empty-text'>No notifications yet</Text>
         </View>
       ) : (
         <ScrollView
           className='notifications-page__list'
           scrollY
           lowerThreshold={80}
           onScrollToLower={() => {
             if (hasMore && !isLoading) load()
           }}
         >
           {notifications.map((n) => (
             <View
               key={n.id}
               className={`notifications-page__item ${n.isRead ? '' : 'notifications-page__item--unread'}`}
               onClick={() => {
                 if (!n.isRead) markRead(n.id)
               }}
             >
               {!n.isRead && <View className='notifications-page__dot' />}
               <View className='notifications-page__content'>
                 <Text className='notifications-page__title-text'>{n.title}</Text>
                 {n.body && <Text className='notifications-page__body'>{n.body}</Text>}
               </View>
               <View className='notifications-page__meta'>
                 <Text className='notifications-page__time'>{formatTime(n.createdAt)}</Text>
                 <Text className='notifications-page__delete' onClick={() => handleDelete(n.id)}>
                   ✕
                 </Text>
               </View>
             </View>
           ))}
           {hasMore && (
             <View className='notifications-page__list-loading'>
               <Text>Loading more...</Text>
             </View>
           )}
         </ScrollView>
       )}

       {unreadCount > 0 && (
         <View className='notifications-page__badge'>
           <Text>{unreadCount} unread</Text>
         </View>
       )}
     </View>
   )
 }
