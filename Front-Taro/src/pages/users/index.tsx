 import { useEffect, useRef } from 'react'
 import { View, Text, ScrollView, Button } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useUsersStore } from '../../stores/users-store'
 import './index.scss'
 
 export default function UserListPage() {
   const { users, isLoading, error, hasMore, loadUsers } = useUsersStore()
   const pageLoaded = useRef(false)
 
   useEffect(() => {
     if (!pageLoaded.current) {
       loadUsers(true)
       pageLoaded.current = true
     }
   }, [])
 
   const handleScrollToLower = () => {
     if (!isLoading && hasMore) {
       loadUsers()
     }
   }
 
   return (
     <View className='users-page'>
       {error && users.length === 0 && (
         <View className='users-page__error'>
           <Text className='users-page__error-text'>{error}</Text>
           <Button className='users-page__retry' onClick={() => loadUsers(true)}>
             Retry
           </Button>
         </View>
       )}
 
       {isLoading && users.length === 0 ? (
         <View className='users-page__loading'>
           <View className='spinner' />
         </View>
       ) : (
         <ScrollView
           className='users-page__list'
           scrollY
           onScrollToLower={handleScrollToLower}
           lowerThreshold={200}
         >
           {users.map((user) => (
             <View
               key={user.id}
               className='users-page__item card'
               onClick={() => Taro.navigateTo({ url: `/pages/user-detail/index?id=${user.id}` })}
             >
               <View className='users-page__item-avatar'>
                 <Text className='users-page__item-avatar-text'>
                   {user.nickname?.[0]?.toUpperCase() || '?'}
                 </Text>
               </View>
               <View className='users-page__item-info'>
                 <Text className='users-page__item-name'>{user.nickname}</Text>
                 <Text className='users-page__item-username'>@{user.username}</Text>
               </View>
               <Text className='users-page__item-arrow'>›</Text>
             </View>
           ))}
           {isLoading && hasMore && (
             <View className='users-page__list-loading'>
               <View className='spinner' />
             </View>
           )}
         </ScrollView>
       )}
     </View>
   )
 }
