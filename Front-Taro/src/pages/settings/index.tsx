 import { useState, useEffect } from 'react'
 import { View, Text, Button } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useThemeStore, ThemeMode } from '../../stores/theme-store'
 import { useAuthStore } from '../../stores/auth-store'
 import './index.scss'
 
 export default function SettingsPage() {
   const { themeMode, setThemeMode } = useThemeStore()
   const logout = useAuthStore((s) => s.logout)
   const [appVersion] = useState('1.0.0')
 
   const themeOptions: { label: string; value: ThemeMode; icon: string }[] = [
     { label: 'Light', value: 'light', icon: '☀️' },
     { label: 'Dark', value: 'dark', icon: '🌙' },
     { label: 'System', value: 'system', icon: '⚙️' },
   ]
 
   const handleLogout = () => {
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
 
   return (
     <View className='settings-page'>
       {/* Appearance */}
       <Text className='settings-page__section'>Appearance</Text>
       <View className='settings-page__card card'>
         <View className='settings-page__row'>
           <Text className='settings-page__row-icon'>🎨</Text>
           <Text className='settings-page__row-label'>Theme</Text>
         </View>
         <View className='settings-page__theme-options'>
           {themeOptions.map((opt) => (
             <View
               key={opt.value}
               className={`settings-page__theme-option ${themeMode === opt.value ? 'settings-page__theme-option--active' : ''}`}
               onClick={() => setThemeMode(opt.value)}
             >
               <Text className='settings-page__theme-icon'>{opt.icon}</Text>
               <Text className='settings-page__theme-label'>{opt.label}</Text>
             </View>
           ))}
         </View>
       </View>
 
       {/* Account */}
       <Text className='settings-page__section'>Account</Text>
       <View className='settings-page__card card'>
         <View className='settings-page__row' onClick={() => Taro.navigateTo({ url: '/pages/sessions/index' })}>
           <Text className='settings-page__row-icon'>📱</Text>
           <Text className='settings-page__row-label'>Login Devices</Text>
           <Text className='settings-page__row-arrow'>›</Text>
         </View>
         <View className='settings-page__divider' />
         <View className='settings-page__row settings-page__row--danger' onClick={handleLogout}>
           <Text className='settings-page__row-icon'>🚪</Text>
           <Text className='settings-page__row-label'>Sign Out</Text>
         </View>
       </View>
 
       {/* Legal */}
       <Text className='settings-page__section'>Legal</Text>
       <View className='settings-page__card card'>
         <View className='settings-page__row' onClick={() => Taro.navigateTo({ url: '/pages/privacy/index' })}>
           <Text className='settings-page__row-icon'>🔒</Text>
           <Text className='settings-page__row-label'>Privacy Policy</Text>
           <Text className='settings-page__row-arrow'>›</Text>
         </View>
         <View className='settings-page__divider' />
         <View className='settings-page__row' onClick={() => Taro.navigateTo({ url: '/pages/terms/index' })}>
           <Text className='settings-page__row-icon'>📄</Text>
           <Text className='settings-page__row-label'>Terms of Service</Text>
           <Text className='settings-page__row-arrow'>›</Text>
         </View>
       </View>
 
       {/* App Info */}
       <Text className='settings-page__section'>App Info</Text>
       <View className='settings-page__card card'>
         <View className='settings-page__row'>
           <Text className='settings-page__row-icon'>ℹ️</Text>
           <Text className='settings-page__row-label'>Version</Text>
           <Text className='settings-page__row-value'>v{appVersion}</Text>
         </View>
       </View>
     </View>
   )
 }
