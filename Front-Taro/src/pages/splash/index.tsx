 import { useEffect } from 'react'
 import { View, Text, Image } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useAuthStore } from '../../stores/auth-store'
 import './index.scss'
 
 export default function SplashPage() {
   const status = useAuthStore((s) => s.status)
 
   useEffect(() => {
     const timer = setTimeout(() => {
       if (status === 'authenticated') {
         Taro.switchTab({ url: '/pages/dashboard/index' })
       } else {
         Taro.redirectTo({ url: '/pages/login/index' })
       }
     }, 800)
 
     return () => clearTimeout(timer)
   }, [status])
 
   return (
     <View className='splash'>
       <View className='splash__content'>
         <View className='splash__icon'>
           <Text className='splash__icon-text'>A</Text>
         </View>
         <Text className='splash__title'>App</Text>
         <View className='splash__loader' />
       </View>
     </View>
   )
 }
