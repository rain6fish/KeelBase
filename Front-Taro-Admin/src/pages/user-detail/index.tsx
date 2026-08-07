import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { adminService } from '../../services/admin-service'
import { useLocaleStore, t } from '../../i18n'
import type { UserDetail } from '../../types/admin'
import './index.scss'

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  userId: number
  onBack: () => void
}

function UserDetailPage({ userId, onBack }: Props) {
  const { locale } = useLocaleStore()
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    adminService.getUserDetail(userId).then(setDetail).catch((err: any) => {
      setErrorMessage(err?.message || t('loadFailed'))
    })
  }, [userId, locale])

  if (errorMessage) {
    return (
      <View className='page'>
        <Text className='page__title' onClick={onBack}>← {t('back')}</Text>
        <View className='ud__error'><Text>{errorMessage}</Text></View>
      </View>
    )
  }
  if (!detail) {
    return <View className='page'><Text className='page__title'>{t('loading')}</Text></View>
  }

  return (
    <View className='page'>
      <Text className='page__title' onClick={onBack}>← {t('back')}</Text>

      <View className='card'>
        <Text className='ud__section'>{t('navUsers')} #{detail.id}</Text>
        <View className='ud__row'><Text className='ud__label'>{t('usernameCol')}</Text><Text className='ud__value'>{detail.username}</Text></View>
        <View className='ud__row'><Text className='ud__label'>{t('emailCol')}</Text><Text className='ud__value'>{detail.email}</Text></View>
        <View className='ud__row'><Text className='ud__label'>{t('roleCol')}</Text><Text className='ud__value'>{detail.role}</Text></View>
        <View className='ud__row'><Text className='ud__label'>{t('createdAt')}</Text><Text className='ud__value'>{formatTime(detail.createdAt)}</Text></View>
      </View>

      <View className='card'>
        <Text className='ud__section'>{t('statistics')}</Text>
        <View className='ud__stats'>
          <View className='ud__stat'><Text className='ud__stat-value'>{detail.counts.events}</Text><Text className='ud__stat-label'>{t('events')}</Text></View>
          <View className='ud__stat'><Text className='ud__stat-value'>{detail.counts.operationAuditLogs}</Text><Text className='ud__stat-label'>{t('opAuditLogs')}</Text></View>
          <View className='ud__stat'><Text className='ud__stat-value'>{detail.counts.aiAuditLogs}</Text><Text className='ud__stat-label'>{t('aiAuditLogs')}</Text></View>
          <View className='ud__stat'><Text className='ud__stat-value'>{detail.counts.totalTokens}</Text><Text className='ud__stat-label'>Token</Text></View>
        </View>
      </View>

      <View className='card'>
        <Text className='ud__section'>{t('sessions')}</Text>
        {detail.sessions.length === 0 && <Text className='ud__empty'>{t('noSessions')}</Text>}
        {detail.sessions.map((s) => (
          <View key={s.id} className='ud__row'>
            <Text className='ud__label'>{s.deviceName ?? t('unknownDevice')}</Text>
            <Text className='ud__value'>{s.ip ?? '-'} · {formatTime(s.lastActiveAt)}</Text>
          </View>
        ))}
      </View>

      <View className='card'>
        <Text className='ud__section'>{t('notifications')}</Text>
        {detail.notifications.length === 0 && <Text className='ud__empty'>{t('noNotifications')}</Text>}
        {detail.notifications.map((n) => (
          <View key={n.id} className='ud__row ud__notif'>
            <View className='ud__notif-main'>
              <Text className='ud__notif-title'>{n.title}</Text>
              {n.body && <Text className='ud__notif-body'>{n.body}</Text>}
            </View>
            <Text className={`ud__notif-status ${n.isRead ? 'read' : 'unread'}`}>
              {n.isRead ? t('read') : t('unread')}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export default UserDetailPage
