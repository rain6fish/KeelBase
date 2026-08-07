 import { useState } from 'react'
 import { View, Text, Input, Button, Form } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useAuthStore } from '../../stores/auth-store'
 import { validateUsername, validateRequired } from '../../utils/validators'
 import './index.scss'
 
 export default function LoginPage() {
   const [username, setUsername] = useState('')
   const [password, setPassword] = useState('')
   const [showPassword, setShowPassword] = useState(false)
   const [errors, setErrors] = useState<{ username?: string; password?: string }>({})
 
   const { login, status, errorMessage } = useAuthStore()
   const isLoading = status === 'loading'
 
   const handleSubmit = async () => {
     const usernameErr = validateUsername(username)
     const passwordErr = validateRequired(password, 'Password')
     setErrors({ username: usernameErr || undefined, password: passwordErr || undefined })
 
     if (usernameErr || passwordErr) return
 
     const success = await login(username.trim(), password)
     if (success) {
       Taro.switchTab({ url: '/pages/dashboard/index' })
     }
   }
 
   return (
     <View className='login'>
       <View className='login__content'>
         <View className='login__header'>
           <View className='login__icon'>
             <Text className='login__icon-text'>A</Text>
           </View>
           <Text className='login__title'>App</Text>
           <Text className='login__subtitle'>Sign in to continue</Text>
         </View>
 
         {errorMessage && (
           <View className='login__error'>
             <Text className='login__error-text'>{errorMessage}</Text>
           </View>
         )}
 
         <View className='login__form'>
           <View className='form-group'>
             <Text className='form-label'>Username</Text>
             <Input
               className={`form-input ${errors.username ? 'form-input--error' : ''}`}
               placeholder='Enter your username'
               value={username}
               onInput={(e) => setUsername(e.detail.value)}
             />
             {errors.username && <Text className='form-error'>{errors.username}</Text>}
           </View>
 
           <View className='form-group'>
             <Text className='form-label'>Password</Text>
             <View className='password-input'>
               <Input
                 className={`form-input ${errors.password ? 'form-input--error' : ''}`}
                 placeholder='Enter your password'
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
             className='login__button'
             loading={isLoading}
             disabled={isLoading}
             onClick={handleSubmit}
           >
             Sign In
           </Button>
 
           <View className='login__footer'>
             <Text className='login__footer-text'>Don't have an account? </Text>
             <Text className='login__footer-link' onClick={() => Taro.navigateTo({ url: '/pages/register/index' })}>
               Register
             </Text>
           </View>
         </View>
       </View>
     </View>
   )
 }
