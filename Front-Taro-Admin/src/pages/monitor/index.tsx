import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { adminService } from '../../services/admin-service'
import { useLocaleStore, t } from '../../i18n'
import type { MonitorSummary } from '../../types/admin'
import './index.scss'

function MonitorPage() {
  const { locale } = useLocaleStore()
  const [summary, setSummary] = useState<MonitorSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fetchSummary = async () => {
    setErrorMessage(null)
    try {
      setSummary(await adminService.getMonitorSummary())
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load monitoring data')
    }
  }

  useEffect(() => {
    fetchSummary()
    const timer = setInterval(fetchSummary, 15000)
    return () => clearInterval(timer)
  }, [locale])

  if (errorMessage && !summary) {
    return (
      <View className='page'>
        <Text className='page__title'>{t('monitorTitle')}</Text>
        <View className='monitor__error'><Text>{errorMessage}</Text></View>
      </View>
    )
  }
  if (!summary) {
    return (
      <View className='page'><Text className='page__title'>{t('monitorTitle')}</Text><Text>{t('loading')}</Text></View>
    )
  }

  const depItems = [
    { label: t('database'), value: summary.dependencies.database },
    { label: t('redis'), value: summary.dependencies.redis },
    { label: t('queue'), value: summary.dependencies.queue },
    { label: t('storage'), value: summary.dependencies.storage },
    { label: t('mail'), value: summary.dependencies.mail },
    { label: t('push'), value: summary.dependencies.push },
  ]
  const countItems = [
    { label: t('users'), value: summary.counts.users },
    { label: t('events'), value: summary.counts.events },
    { label: t('sessions'), value: summary.counts.sessions },
    { label: t('notifications'), value: summary.counts.notifications },
    { label: t('conversations'), value: summary.counts.conversations },
    { label: t('knowledge'), value: summary.counts.knowledge },
    { label: t('opAuditLogs'), value: summary.counts.operationAuditLogs },
    { label: t('aiAuditLogs'), value: summary.counts.aiAuditLogs },
  ]
  const metricItems = [
    { label: t('requestRate'), value: summary.metrics.requestRateRps != null ? `${summary.metrics.requestRateRps} rps` : '-' },
    { label: t('errorRate'), value: summary.metrics.errorRatePct != null ? `${summary.metrics.errorRatePct}%` : '-' },
    { label: t('latencyP95'), value: summary.metrics.latencyP95Ms != null ? `${summary.metrics.latencyP95Ms}ms` : '-' },
    { label: t('inFlight'), value: summary.metrics.inFlight ?? '-' },
  ]

  const fmtUptime = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return `${h}h ${m}m ${s}s`
  }

  return (
    <View className='page'>
      <View className='flex-between'>
        <Text className='page__title'>{t('monitorTitle')}</Text>
        <Text className='monitor__uptime'>{t('uptime', { time: fmtUptime(summary.health.uptimeSec) })}</Text>
      </View>

      <View className='card monitor__health'>
        <View className='monitor__health-left'>
          <View className={`monitor__status-dot ${summary.health.status === 'ok' ? 'ok' : 'error'}`} />
          <Text className='monitor__health-text'>
            {t('serviceStatus', { status: summary.health.status === 'ok' ? t('statusOk') : t('statusError') })}
          </Text>
        </View>
        {summary.health.version && (
          <Text className='monitor__version'>v{summary.health.version}</Text>
        )}
      </View>

      <Text className='monitor__section-title'>{t('dependencies')}</Text>
      <View className='monitor__grid'>
        {depItems.map((d) => (
          <View key={d.label} className='card monitor__cell'>
            <Text className='monitor__cell-label'>{d.label}</Text>
            <Text className={`monitor__cell-value ${d.value === 'up' || d.value === 'ok' ? 'ok' : ''}`}>
              {d.value}
            </Text>
          </View>
        ))}
      </View>

      <Text className='monitor__section-title'>{t('keyMetrics')}</Text>
      <View className='monitor__grid'>
        {metricItems.map((m) => (
          <View key={m.label} className='card monitor__cell'>
            <Text className='monitor__cell-label'>{m.label}</Text>
            <Text className='monitor__cell-value'>{m.value}</Text>
          </View>
        ))}
      </View>

      <Text className='monitor__section-title'>{t('dataScale')}</Text>
      <View className='monitor__grid'>
        {countItems.map((c) => (
          <View key={c.label} className='card monitor__cell'>
            <Text className='monitor__cell-label'>{c.label}</Text>
            <Text className='monitor__cell-value'>{c.value}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export default MonitorPage
