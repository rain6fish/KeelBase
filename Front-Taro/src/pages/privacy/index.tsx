 import { View, Text, ScrollView } from '@tarojs/components'
 import './index.scss'
 
 export default function PrivacyPage() {
   return (
     <ScrollView className='legal-page' scrollY>
       <View className='legal-page__content'>
         <Text className='legal-page__title'>Privacy Policy</Text>
         <Text className='legal-page__updated'>Last updated: July 2026</Text>
 
         <Text className='legal-page__heading'>1. Information We Collect</Text>
         <Text className='legal-page__text'>
           We collect information you provide when registering an account, including your username,
           nickname, and password. We also collect usage data to improve our services.
         </Text>
 
         <Text className='legal-page__heading'>2. How We Use Your Information</Text>
         <Text className='legal-page__text'>
           Your information is used to provide, maintain, and improve our services. We do not share
           your personal data with third parties except as required by law.
         </Text>
 
         <Text className='legal-page__heading'>3. Data Security</Text>
         <Text className='legal-page__text'>
           We implement industry-standard security measures including encryption and secure storage
           to protect your data.
         </Text>
 
         <Text className='legal-page__heading'>4. Contact Us</Text>
         <Text className='legal-page__text'>
           If you have any questions about this policy, please contact our support team.
         </Text>
       </View>
     </ScrollView>
   )
 }
