 import { useState, useEffect, useCallback } from 'react'
 import { View, Text, ScrollView, Button } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useEventsStore } from '../../stores/events-store'
 import { EVENT_COLORS } from '../../utils/constants'
 import { formatMonthYear, formatShortDateTime, formatDate } from '../../utils/format'
 import './index.scss'
 
 export default function EventListPage() {
   const [currentMonth, setCurrentMonth] = useState(() => {
     const now = new Date()
     return new Date(now.getFullYear(), now.getMonth(), 1)
   })
 
   const { events, isLoading, error, loadEvents } = useEventsStore()
 
   const fetchEvents = useCallback(() => {
     const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
     loadEvents(formatDate(currentMonth), formatDate(end))
   }, [currentMonth])
 
   useEffect(() => {
     fetchEvents()
   }, [fetchEvents])
 
   const prevMonth = () => {
     setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
   }
 
   const nextMonth = () => {
     setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
   }
 
   const handleAddEvent = async () => {
     await Taro.navigateTo({ url: '/pages/event-form/index' })
     fetchEvents()
   }
 
   return (
     <View className='events-page'>
       {/* Month navigation */}
       <View className='events-page__nav'>
         <Text className='events-page__nav-btn' onClick={prevMonth}>‹</Text>
         <Text className='events-page__nav-title'>{formatMonthYear(currentMonth)}</Text>
         <Text className='events-page__nav-btn' onClick={nextMonth}>›</Text>
       </View>
 
       <View className='events-page__divider' />
 
       {/* Error state */}
       {error && (
         <View className='events-page__error'>
           <Text className='events-page__error-text'>{error}</Text>
           <Button className='events-page__retry' onClick={fetchEvents}>Retry</Button>
         </View>
       )}
 
       {/* Event list */}
       {isLoading && events.length === 0 ? (
         <View className='events-page__loading'>
           <View className='spinner' />
         </View>
       ) : events.length === 0 ? (
         <View className='events-page__empty'>
           <Text className='events-page__empty-text'>No events this month</Text>
         </View>
       ) : (
         <ScrollView className='events-page__list' scrollY refresherEnabled onRefresherRefresh={fetchEvents}>
           {events.map((event) => {
             const color = EVENT_COLORS[event.colorRole] || EVENT_COLORS[0]
             return (
               <View key={event.id} className='events-page__item card'>
                 <View className='events-page__item-color' style={{ backgroundColor: color }} />
                 <View className='events-page__item-info'>
                   <Text className='events-page__item-title'>{event.title}</Text>
                   <Text className='events-page__item-time'>
                     {formatShortDateTime(event.startTime)} - {event.startTime?.slice(11, 16)}
                   </Text>
                 </View>
                 {event.isCancelled && <Text className='events-page__item-cancelled'>✕</Text>}
               </View>
             )
           })}
         </ScrollView>
       )}
 
       {/* FAB */}
       <View className='events-page__fab' onClick={handleAddEvent}>
         <Text className='events-page__fab-icon'>+</Text>
       </View>
     </View>
   )
 }
