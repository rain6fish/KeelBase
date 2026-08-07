 import { useEffect } from 'react'
 import { View, Text } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useSessionStore } from '../../stores/session-store'
 import './index.scss'

 export default function SessionsPage() {
   const { sessions, isLoading, load, revoke } = useSessionStore()

   useEffect(() => {
     load()
   }, [])

   const formatTime = (iso?: string) => {
     if (!iso) return '—'
     const d = new Date(iso)
     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
   }

   const handleRevoke = (session: { id: number; deviceName?: string }) => {
     Taro.showModal({
       title: 'Revoke Device',
       content: `Sign out this device${session.deviceName ? ` (${session.deviceName})` : ''}?`,
       success: async (res) => {
         if (res.confirm) {
           try {
             await revoke(session.id)
             Taro.showToast({ title: 'Session revoked', icon: 'success' })
           } catch {
             Taro.showToast({ title: 'Failed to revoke', icon: 'none' })
           }
         }
       },
     })
   }

   return (
     <View className='sessions-page'>
       <Text className='sessions-page__title'>Login Devices</Text>
       <Text className='sessions-page__subtitle'>Devices that have access to your account</Text>

       {isLoading ? (
         <View className='sessions-page__loading'>
           <View className='spinner' />
         </View>
       ) : sessions.length === 0 ? (
         <View className='sessions-page__empty'>
           <Text className='sessions-page__empty-text'>No active sessions</Text>
         </View>
       ) : (
         <View className='sessions-page__list'>
           {sessions.map((s) => (
             <View key={s.id} className='sessions-page__item'>
               <View className='sessions-page__item-icon'>
                 <Text>📱</Text>
               </View>
               <View className='sessions-page__item-info'>
                 <View className='sessions-page__item-header'>
                   <Text className='sessions-page__item-name'>
                     {s.deviceName || 'Unknown Device'}
                   </Text>
                   {s.isCurrent && (
                     <Text className='sessions-page__item-current'>Current</Text>
                   )}
                 </View>
                 <Text className='sessions-page__item-meta'>
                   IP: {s.ip || '—'} · Last active: {formatTime(s.lastActiveAt)}
                 </Text>
                 <Text className='sessions-page__item-meta'>
                   Signed in: {formatTime(s.createdAt)}
                 </Text>
               </View>
               {!s.isCurrent && (
                 <Text
                   className='sessions-page__item-revoke'
                   onClick={() => handleRevoke(s)}
                 >
                   Revoke
                 </Text>
               )}
             </View>
           ))}
         </View>
       )}
     </View>
   )
 }
