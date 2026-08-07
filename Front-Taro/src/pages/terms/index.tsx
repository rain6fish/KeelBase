 import { View, Text, ScrollView } from '@tarojs/components'
 import '../privacy/index.scss'
 
 export default function TermsPage() {
   return (
     <ScrollView className='legal-page' scrollY>
       <View className='legal-page__content'>
         <Text className='legal-page__title'>Terms of Service</Text>
         <Text className='legal-page__updated'>Last updated: July 2026</Text>
 
         <Text className='legal-page__heading'>1. Acceptance of Terms</Text>
         <Text className='legal-page__text'>
           By using our application, you agree to these terms of service. If you do not agree,
           please do not use the application.
         </Text>
 
         <Text className='legal-page__heading'>2. User Responsibilities</Text>
         <Text className='legal-page__text'>
           You are responsible for maintaining the confidentiality of your account credentials and
           for all activities under your account.
         </Text>
 
         <Text className='legal-page__heading'>3. Service Availability</Text>
         <Text className='legal-page__text'>
           We strive to provide uninterrupted service but do not guarantee 100% availability. We
           reserve the right to modify or discontinue services with reasonable notice.
         </Text>
 
         <Text className='legal-page__heading'>4. Limitation of Liability</Text>
         <Text className='legal-page__text'>
           We shall not be liable for any indirect, incidental, or consequential damages arising
           from your use of the application.
         </Text>
       </View>
     </ScrollView>
   )
 }
