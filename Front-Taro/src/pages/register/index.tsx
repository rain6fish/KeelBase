 import { useState } from 'react'
 import { View, Text, Input, Button } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useAuthStore } from '../../stores/auth-store'
 import { validateUsername, validatePassword, validateNickname } from '../../utils/validators'
 import './index.scss'
 
 export default function RegisterPage() {
   const [username, setUsername] = useState('')
   const [password, setPassword] = useState('')
   const [nickname, setNickname] = useState('')
   const [showPassword, setShowPassword] = useState(false)
   const [errors, setErrors] = useState<Record<string, string>>({})
 
   const { register, status, errorMessage } = useAuthStore()
   const isLoading = status === 'loading'
 
   const handleSubmit = async () => {
     const usernameErr = validateUsername(username)
     const passwordErr = validatePassword(password)
     const nicknameErr = validateNickname(nickname)
     setErrors({
       username: usernameErr || '',
       password: passwordErr || '',
       nickname: nicknameErr || '',
     })
 
     if (usernameErr || passwordErr || nicknameErr) return
 
     const success = await register(username.trim(), password, nickname.trim())
     if (success) {
       Taro.switchTab({ url: '/pages/dashboard/index' })
     }
   }
 
   return (
     <View className='register'>
       <View className='register__content'>
         <View className='register__header'>
           <View className='register__icon'>
             <Text className='register__icon-text'>A</Text>
           </View>
           <Text className='register__title'>Create Account</Text>
           <Text className='register__subtitle'>Join App today</Text>
         </View>
 
         {errorMessage && (
           <View className='register__error'>
             <Text className='register__error-text'>{errorMessage}</Text>
           </View>
         )}
 
         <View className='register__form'>
           <View className='form-group'>
             <Text className='form-label'>Username</Text>
             <Input
               className={`form-input ${errors.username ? 'form-input--error' : ''}`}
               placeholder='Choose a username'
               value={username}
               onInput={(e) => setUsername(e.detail.value)}
             />
             {errors.username && <Text className='form-error'>{errors.username}</Text>}
           </View>
 
           <View className='form-group'>
             <Text className='form-label'>Nickname</Text>
             <Input
               className={`form-input ${errors.nickname ? 'form-input--error' : ''}`}
               placeholder='Your display name'
               value={nickname}
               onInput={(e) => setNickname(e.detail.value)}
             />
             {errors.nickname && <Text className='form-error'>{errors.nickname}</Text>}
           </View>
 
           <View className='form-group'>
             <Text className='form-label'>Password</Text>
             <View className='password-input'>
               <Input
                 className={`form-input ${errors.password ? 'form-input--error' : ''}`}
                 placeholder='At least 8 characters'
                 password={!showPassword}
                 value={password}
                 onInput={(e) => setPassword(e.detail.value)}
               />
               <Text className='password-toggle' onClick={() => setShowPassword(!showPassword)}>
                 {showPassword ? 'Hide' : 'Show'}
               </Text>
             </View>
             {errors.password && <Text className='form-error'>{errors.password}</Text>}
           </View>
 
           <Button
             className='register__button'
             loading={isLoading}
             disabled={isLoading}
             onClick={handleSubmit}
           >
             Create Account
           </Button>
 
           <View className='register__footer'>
             <Text className='register__footer-text'>Already have an account? </Text>
             <Text className='register__footer-link' onClick={() => Taro.navigateBack()}>
               Sign In
             </Text>
           </View>
         </View>
       </View>
     </View>
   )
 }
