import { useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAuthStore } from '../../stores/auth-store'
import { APP_NAME } from '../../utils/constants'
import { useLocaleStore, t } from '../../i18n'
import './index.scss'

function LoginPage() {
  const { status, errorMessage, login, tryAutoLogin } = useAuthStore()
  const { locale, toggle } = useLocaleStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async () => {
    if (!username || !password) return
    const ok = await login(username, password)
    if (ok) {
      Taro.redirectTo({ url: '/pages/main/index' })
    }
  }

  return (
    <View className='admin-login'>
      <View className='admin-login__card'>
        <View className='admin-login__header'>
          <Text className='admin-login__title'>{APP_NAME}</Text>
          <Text className='admin-login__subtitle'>{t('loginTitle')}</Text>
          <Text className='admin-login__lang' onClick={toggle}>
            {locale === 'zh' ? 'EN' : '中文'}
          </Text>
        </View>

        {errorMessage && (
          <View className='admin-login__error'>
            <Text>{errorMessage}</Text>
          </View>
        )}

        <View className='admin-login__form'>
          <View className='admin-login__field'>
            <Text className='admin-login__label'>{t('username')}</Text>
            <Input
              className='admin-login__input'
              placeholder={t('usernamePlaceholder')}
              value={username}
              onInput={(e) => setUsername(e.detail.value)}
            />
          </View>

          <View className='admin-login__field'>
            <Text className='admin-login__label'>{t('password')}</Text>
            <View className='admin-login__password'>
              <Input
                className='admin-login__input'
                password={!showPassword}
                placeholder={t('passwordPlaceholder')}
                value={password}
                onInput={(e) => setPassword(e.detail.value)}
                onConfirm={handleSubmit}
              />
              <Text
                className='admin-login__toggle'
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? t('cancel') : t('show')}
              </Text>
            </View>
          </View>

          <Button
            className='admin-login__button'
            onClick={handleSubmit}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? t('loggingIn') : t('login')}
          </Button>
        </View>
      </View>
    </View>
  )
}

export default LoginPage
