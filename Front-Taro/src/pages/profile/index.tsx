 import { View, Text } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useAuthStore } from '../../stores/auth-store'
 import './index.scss'
 
 export default function ProfilePage() {
   const user = useAuthStore((s) => s.user)
   const logout = useAuthStore((s) => s.logout)
 
   const handleLogout = async () => {
     Taro.showModal({
       title: 'Sign Out',
       content: 'Are you sure you want to sign out?',
       success: async (res) => {
         if (res.confirm) {
           await logout()
           Taro.redirectTo({ url: '/pages/login/index' })
         }
       },
     })
   }
 
   const menuItems = [
     { icon: '📅', label: 'My Events', path: '/pages/events/index' },
     { icon: '📤', label: 'Uploads', path: '/pages/upload/index' },
     { icon: '🔔', label: 'Notifications', path: '/pages/notifications/index' },
     { icon: '📱', label: 'Login Devices', path: '/pages/sessions/index' },
     { icon: '🔒', label: 'Privacy Policy', path: '/pages/privacy/index' },
     { icon: '📄', label: 'Terms of Service', path: '/pages/terms/index' },
   ]
 
   return (
     <View className='profile-page'>
       {/* User info card */}
       <View className='profile-page__card card'>
         <View className='profile-page__avatar'>
           <Text className='profile-page__avatar-text'>
             {user?.nickname?.[0]?.toUpperCase() || '?'}
           </Text>
         </View>
         <View className='profile-page__info'>
           <Text className='profile-page__name'>{user?.nickname || 'User'}</Text>
           <Text className='profile-page__username'>@{user?.username || 'unknown'}</Text>
         </View>
       </View>
 
       {/* Menu items */}
       {menuItems.map((item) => (
         <View
           key={item.label}
           className='profile-page__menu-item'
           onClick={() => Taro.navigateTo({ url: item.path })}
         >
           <Text className='profile-page__menu-icon'>{item.icon}</Text>
           <Text className='profile-page__menu-label'>{item.label}</Text>
           <Text className='profile-page__menu-arrow'>›</Text>
         </View>
       ))}
 
       <View className='profile-page__divider' />
 
       {/* Sign out */}
       <View className='profile-page__signout' onClick={handleLogout}>
         <Text className='profile-page__signout-text'>Sign Out</Text>
       </View>
     </View>
   )
 }
