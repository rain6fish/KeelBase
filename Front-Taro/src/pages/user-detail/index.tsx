 import { useEffect, useState } from 'react'
 import { View, Text } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { usersService } from '../../services/users-service'
 import type { UserItem } from '../../types/user'
 import { formatDateTime } from '../../utils/format'
 import './index.scss'
 
 export default function UserDetailPage() {
   const router = Taro.getCurrentInstance().router
   const userId = Number(router?.params?.id || 0)
   const [user, setUser] = useState<UserItem | null>(null)
   const [loading, setLoading] = useState(true)
 
   useEffect(() => {
     if (userId) {
       usersService
         .getUser(userId)
         .then(setUser)
         .catch(() => {})
         .finally(() => setLoading(false))
     }
   }, [userId])
 
   if (loading) {
     return (
       <View className='user-detail'>
         <View className='user-detail__loading'>
           <View className='spinner' />
         </View>
       </View>
     )
   }
 
   if (!user) {
     return (
       <View className='user-detail'>
         <View className='user-detail__not-found'>
           <Text>User not found</Text>
         </View>
       </View>
     )
   }
 
   return (
     <View className='user-detail'>
       <View className='user-detail__header'>
         <View className='user-detail__avatar'>
           <Text className='user-detail__avatar-text'>
             {user.nickname?.[0]?.toUpperCase() || '?'}
           </Text>
         </View>
         <Text className='user-detail__name'>{user.nickname}</Text>
         <Text className='user-detail__username'>@{user.username}</Text>
       </View>
 
       <View className='user-detail__info card'>
         <InfoRow label='ID' value={String(user.id)} />
         <InfoRow label='Username' value={user.username} />
         <InfoRow label='Nickname' value={user.nickname} />
         {user.createdAt && <InfoRow label='Created' value={formatDateTime(user.createdAt)} />}
         {user.updatedAt && <InfoRow label='Updated' value={formatDateTime(user.updatedAt)} />}
         {user.isLocked && (
           <View className='user-detail__locked'>
             <Text>🔒 Account is locked</Text>
           </View>
         )}
       </View>
     </View>
   )
 }
 
 function InfoRow({ label, value }: { label: string; value: string }) {
   return (
     <View className='info-row'>
       <Text className='info-row__label'>{label}</Text>
       <Text className='info-row__value'>{value}</Text>
     </View>
   )
 }
