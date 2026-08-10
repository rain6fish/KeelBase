 import { View, Text, Input } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import './index.scss'
 
 export default function ExplorePage() {
   const quickCards = [
     { icon: '🤖', label: 'AI', color: '#007AFF', path: '/pages/ai/index' },
     { icon: '📤', label: 'Upload', color: '#16A34A', path: '/pages/upload/index' },
     { icon: '📅', label: 'Events', color: '#F59E0B', path: '/pages/events/index' },
     { icon: '⚙️', label: 'Settings', color: '#9333EA', path: '/pages/settings/index' },
   ]
 
   return (
     <View className='explore-page'>
       {/* Search bar */}
       <View className='explore-page__search'>
         <Text className='explore-page__search-icon'>🔍</Text>
         <Input
           className='explore-page__search-input'
           placeholder='Search features, users, events...'
           onConfirm={(e) => {
             // TODO: Implement search
           }}
         />
       </View>
 
       {/* Quick Access */}
       <Text className='explore-page__section-title'>Quick Access</Text>
       <View className='explore-page__grid'>
         {quickCards.map((card) => (
           <View
             key={card.label}
             className='explore-page__card'
             style={{ backgroundColor: `${card.color}15` }}
             onClick={() => Taro.navigateTo({ url: card.path })}
           >
             <Text className='explore-page__card-icon'>{card.icon}</Text>
             <Text className='explore-page__card-label' style={{ color: card.color }}>
               {card.label}
             </Text>
           </View>
         ))}
       </View>
 
       {/* Recent Activity */}
       <Text className='explore-page__section-title'>Recent Activity</Text>
       <View className='explore-page__empty'>
         <Text className='explore-page__empty-icon'>🔭</Text>
         <Text className='explore-page__empty-text'>Discover new features coming soon!</Text>
       </View>
     </View>
   )
 }
