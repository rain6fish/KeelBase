import { useEffect, useState } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { adminService } from '../../services/admin-service'
import { useLocaleStore, t } from '../../i18n'
import type { AdminSession } from '../../types/admin'
import './index.scss'

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function SessionsPage() {
  const { locale } = useLocaleStore()
  const [items, setItems] = useState<AdminSession[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fetch = async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      setItems(await adminService.getSessions())
    } catch (err: any) {
      setErrorMessage(err?.message || t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch()
  }, [locale])

  const handleRevoke = (s: AdminSession) => {
    Taro.showModal({
      title: t('revokeConfirmTitle'),
      content: t('revokeConfirmContent', { name: s.username ?? String(s.userId), id: s.id }),
      confirmColor: '#dc2626',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await adminService.revokeSession(s.id)
          Taro.showToast({ title: t('revoked'), icon: 'success' })
          fetch()
        } catch (err: any) {
          Taro.showToast({ title: err?.message || t('revokeFailed'), icon: 'none' })
        }
      },
    })
  }

  return (
    <View className='page'>
      <View className='flex-between'>
        <Text className='page__title'>{t('sessionTitle')}</Text>
        <Button size='mini' onClick={fetch}>{t('refresh')}</Button>
      </View>

      {errorMessage && (
        <View className='sess__error'><Text>{errorMessage}</Text></View>
      )}

      <View className='card sess__table'>
        <View className='sess__row sess__row--header'>
          <Text className='sess__col-id'>{t('idCol')}</Text>
          <Text className='sess__col-user'>{t('userCol')}</Text>
          <Text className='sess__col-device'>{t('deviceCol')}</Text>
          <Text className='sess__col-ip'>{t('ipCol')}</Text>
          <Text className='sess__col-time'>{t('lastActive')}</Text>
          <Text className='sess__col-action'>{t('actionCol')}</Text>
        </View>

        {items.map((s) => (
          <View key={s.id} className='sess__row'>
            <Text className='sess__col-id'>{s.id}</Text>
            <Text className='sess__col-user'>{s.username ?? `#${s.userId}`}</Text>
            <Text className='sess__col-device'>{s.deviceName ?? t('unknownDevice')}</Text>
            <Text className='sess__col-ip'>{s.ip ?? '-'}</Text>
            <Text className='sess__col-time'>{formatTime(s.lastActiveAt)}</Text>
            <View className='sess__col-action'>
              <Text className='sess__revoke' onClick={() => handleRevoke(s)}>{t('revoke')}</Text>
            </View>
          </View>
        ))}

        {!loading && items.length === 0 && (
          <View className='sess__empty'><Text>{t('noSessions')}</Text></View>
        )}
      </View>
    </View>
  )
}

export default SessionsPage
