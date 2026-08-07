import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { adminService } from '../../services/admin-service'
import { APP_NAME } from '../../utils/constants'
import { useLocaleStore, t } from '../../i18n'
import type { AppVersionInfo, MonitorSummary } from '../../types/admin'
import './index.scss'

function SystemPage() {
  const { locale } = useLocaleStore()
  const [version, setVersion] = useState<AppVersionInfo | null>(null)
  const [summary, setSummary] = useState<MonitorSummary | null>(null)

  useEffect(() => {
    adminService.getAppVersion().then(setVersion).catch(() => {})
    adminService.getMonitorSummary().then(setSummary).catch(() => {})
  }, [locale])

  const envItems = [
    { label: t('nodeEnv'), value: summary?.health.nodeEnv ?? '-' },
    { label: t('storageDriverLabel'), value: summary?.dependencies.storage ?? '-' },
    { label: t('pushDriverLabel'), value: summary?.dependencies.push ?? '-' },
    { label: t('mailService'), value: summary?.dependencies.mail ?? '-' },
    { label: t('redisCache'), value: summary?.dependencies.redis ?? '-' },
  ]

  return (
    <View className='page'>
      <Text className='page__title'>{t('sysTitle')}</Text>

      <View className='card'>
        <Text className='sys__section'>{t('appInfo')}</Text>
        <View className='sys__row'>
          <Text className='sys__label'>{t('appName')}</Text>
          <Text className='sys__value'>{APP_NAME}</Text>
        </View>
        {version && (
          <>
            <View className='sys__row'>
              <Text className='sys__label'>{t('latestVersion')}</Text>
              <Text className='sys__value'>{version.latestVersion}</Text>
            </View>
            <View className='sys__row'>
              <Text className='sys__label'>{t('minVersion')}</Text>
              <Text className='sys__value'>{version.minRequiredVersion}</Text>
            </View>
            <View className='sys__row'>
              <Text className='sys__label'>{t('updateUrl')}</Text>
              <Text className='sys__value'>{version.updateUrl || '-'}</Text>
            </View>
            {version.changelog.length > 0 && (
              <View className='sys__changelog'>
                <Text className='sys__section'>{t('changelog')}</Text>
                {version.changelog.map((c, i) => (
                  <Text key={i} className='sys__changelog-item'>· {c}</Text>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      <View className='card'>
        <Text className='sys__section'>{t('runtimeEnv')}</Text>
        {envItems.map((e) => (
          <View key={e.label} className='sys__row'>
            <Text className='sys__label'>{e.label}</Text>
            <Text className='sys__value'>{e.value}</Text>
          </View>
        ))}
        {summary && (
          <View className='sys__row'>
            <Text className='sys__label'>{t('uptimeLabel')}</Text>
            <Text className='sys__value'>{summary.health.uptimeSec}s</Text>
          </View>
        )}
      </View>
    </View>
  )
}

export default SystemPage
