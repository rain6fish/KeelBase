 import { View, Text } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useAuthStore } from '../../stores/auth-store'
 import './index.scss'
 
 export default function DashboardPage() {
   const user = useAuthStore((s) => s.user)
   const logout = useAuthStore((s) => s.logout)
 
   const handleLogout = async () => {
     await logout()
     Taro.redirectTo({ url: '/pages/login/index' })
   }
 
   const navItems = [
     { icon: '📅', title: 'Events', color: '#16A34A', path: '/pages/events/index' },
     { icon: '📤', title: 'Upload', color: '#F59E0B', path: '/pages/upload/index' },
     { icon: '🚪', title: 'Sign Out', color: '#DC2626', action: handleLogout },
   ]
 
   return (
     <View className='dashboard'>
       {/* Welcome card */}
       <View className='dashboard__welcome card'>
         <View className='dashboard__welcome-avatar'>
           <Text className='dashboard__welcome-avatar-text'>
             {user?.nickname?.[0]?.toUpperCase() || '?'}
           </Text>
         </View>
         <View className='dashboard__welcome-info'>
           <Text className='dashboard__welcome-name'>Welcome, {user?.nickname || 'User'}</Text>
           <Text className='dashboard__welcome-username'>@{user?.username || '...'}</Text>
         </View>
       </View>
 
       {/* Navigation grid */}
       <View className='dashboard__grid'>
         {navItems.map((item) => (
           <View
             key={item.title}
             className='dashboard__grid-item'
             style={{ borderTopColor: item.color }}
             onClick={() => {
               if (item.action) item.action()
               else if (item.path) Taro.navigateTo({ url: item.path })
             }}
           >
             <Text className='dashboard__grid-icon'>{item.icon}</Text>
             <Text className='dashboard__grid-label'>{item.title}</Text>
           </View>
         ))}
       </View>
     </View>
   )
 }
