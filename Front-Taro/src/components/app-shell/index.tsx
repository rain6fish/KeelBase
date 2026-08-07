 import { View, Text, Image } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useAuthStore } from '../../stores/auth-store'
 import OfflineBanner from '../offline-banner'
 import './index.scss'
 
 interface AppShellProps {
   children: React.ReactNode
 }
 
 const TAB_PAGES = ['/pages/dashboard/index', '/pages/events/index', '/pages/explore/index', '/pages/profile/index']
 
 export default function AppShell({ children }: AppShellProps) {
   const user = useAuthStore((s) => s.user)
 
   const currentPage = Taro.getCurrentInstance()?.router?.path || ''
   const currentIndex = TAB_PAGES.findIndex((p) => currentPage.startsWith(p))
   const activeIndex = currentIndex >= 0 ? currentIndex : 0
 
 const TAB_ROUTES = ['/pages/dashboard/index', '/pages/events/index', '/pages/explore/index', '/pages/profile/index']
 
 const handleTabTap = (index: number) => {
   Taro.redirectTo({ url: TAB_ROUTES[index] })
 }
 
   const handleAvatarTap = () => {
     Taro.navigateTo({ url: '/pages/settings/index' })
   }
 
   return (
     <View className='app-shell'>
       <View className='app-shell__header'>
         <View className='app-shell__header-left'>
           <Text className='app-shell__title'>App</Text>
         </View>
         <View className='app-shell__header-right' onClick={handleAvatarTap}>
           <View className='app-shell__avatar'>
             <Text className='app-shell__avatar-text'>
               {user?.nickname?.[0]?.toUpperCase() || '?'}
             </Text>
           </View>
         </View>
       </View>
       <OfflineBanner />
       <View className='app-shell__content'>{children}</View>
       <View className='app-shell__tabbar'>
         {[
           { icon: 'home', label: 'Home', activeIcon: 'home-filled' },
           { icon: 'calendar', label: 'Events', activeIcon: 'calendar-filled' },
           { icon: 'explore', label: 'Explore', activeIcon: 'explore-filled' },
           { icon: 'user', label: 'Profile', activeIcon: 'user-filled' },
         ].map((tab, index) => (
           <View
             key={tab.label}
             className={`app-shell__tab ${activeIndex === index ? 'app-shell__tab--active' : ''}`}
             onClick={() => handleTabTap(index)}
           >
             <Text className={`app-shell__tab-icon ${tab.icon}`} />
             <Text className='app-shell__tab-label'>{tab.label}</Text>
           </View>
         ))}
       </View>
     </View>
   )
 }
