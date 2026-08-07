 import { View, Text } from '@tarojs/components'
 import { useConnectivityStore } from '../../stores/connectivity-store'
 import './index.scss'
 
 export default function OfflineBanner() {
   const isOnline = useConnectivityStore((s) => s.isOnline)
 
   if (isOnline) return null
 
   return (
     <View className='offline-banner'>
       <Text className='offline-banner__text'>No internet connection</Text>
     </View>
   )
 }
