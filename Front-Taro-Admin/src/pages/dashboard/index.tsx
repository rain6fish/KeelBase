import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useAuditStore } from '../../stores/audit-store'
import { adminService } from '../../services/admin-service'
import { useUiStore, type AdminTab } from '../../stores/ui-store'
import { useLocaleStore, t } from '../../i18n'
import type { PlatformOverview } from '../../types/admin'
import './index.scss'

const QUICK_LINKS: { tab: AdminTab }[] = [
  { tab: 'users' },
  { tab: 'events' },
  { tab: 'knowledge' },
  { tab: 'monitor' },
  { tab: 'audit' },
  { tab: 'op-audit' },
  { tab: 'sessions' },
  { tab: 'notifications' },
]

function quickLabel(tab: AdminTab): string {
  const map: Record<AdminTab, string> = {
    dashboard: t('overview'),
    users: t('navUsers'),
    events: t('navEvents'),
    knowledge: t('navKnowledge'),
    notifications: t('navNotifications'),
    monitor: t('navMonitorCenter'),
    audit: t('navAiAudit'),
    'op-audit': t('navOpAudit'),
    sessions: t('navSessions'),
    observability: t('navObservability'),
    system: t('navSystemInfo'),
  }
  return map[tab]
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function DashboardPage() {
  const { stats, fetchStats } = useAuditStore()
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const { locale } = useLocaleStore()
  const [overview, setOverview] = useState<PlatformOverview | null>(null)

  useEffect(() => {
    fetchStats()
    adminService.getOverview(7).then(setOverview).catch(() => {})
  }, [fetchStats, setActiveTab, locale])

  const countCards = [
    { label: t('users'), value: overview?.counts.users ?? '-' },
    { label: t('events'), value: overview?.counts.events ?? '-' },
    { label: t('todos'), value: overview?.counts.todos ?? '-' },
    { label: t('notifications'), value: overview?.counts.notifications ?? '-' },
    { label: t('opAuditLogs'), value: overview?.counts.operationAuditLogs ?? '-' },
    { label: t('aiAuditLogs'), value: overview?.counts.aiAuditLogs ?? '-' },
  ]

  const aiCards = [
    { label: t('conversations'), value: stats?.totalConversations ?? '-' },
    { label: t('messages'), value: stats?.totalMessages ?? '-' },
    { label: t('totalTokens'), value: stats?.totalTokens ?? '-' },
    { label: t('errors'), value: stats?.totalErrors ?? '-' },
  ]

  const maxTrend = overview && overview.trend.length > 0
    ? Math.max(...overview.trend.map((t) => t.count))
    : 0

  return (
    <View className='page'>
      <Text className='page__title'>{t('overview')}</Text>

      <Text className='dash__section-title'>{t('platformData')}</Text>
      <View className='dash__cards'>
        {countCards.map((c) => (
          <View key={c.label} className='card dash__card'>
            <Text className='dash__card-value'>{c.value}</Text>
            <Text className='dash__card-label'>{c.label}</Text>
          </View>
        ))}
      </View>

      <Text className='dash__section-title'>{t('aiUsage')}</Text>
      <View className='dash__cards'>
        {aiCards.map((c) => (
          <View key={c.label} className='card dash__card'>
            <Text className='dash__card-value'>{c.value}</Text>
            <Text className='dash__card-label'>{c.label}</Text>
          </View>
        ))}
      </View>

      {overview && (
        <View className='dash__lower'>
          <View className='card dash__trend'>
            <Text className='dash__section-title'>{t('newUsers7d')}</Text>
            {overview.trend.length === 0 && (
              <Text className='dash__trend-empty'>{t('noTrend')}</Text>
            )}
            {overview.trend.map((t) => (
              <View key={t.date} className='dash__trend-row'>
                <Text className='dash__trend-date'>{t.date}</Text>
                <View className='dash__trend-bar-wrap'>
                  <View
                    className='dash__trend-bar'
                    style={{ width: maxTrend > 0 ? `${Math.max(4, (t.count / maxTrend) * 100)}%` : '4%' }}
                  />
                </View>
                <Text className='dash__trend-count'>{t.count}</Text>
              </View>
            ))}
          </View>

          <View className='card dash__storage'>
            <Text className='dash__section-title'>{t('storageUsage')}</Text>
            <Text className='dash__storage-value'>{formatBytes(overview.storage.bytes)}</Text>
            <Text className='dash__storage-driver'>{t('storageDriver', { driver: overview.storage.driver })}</Text>
          </View>
        </View>
      )}

      {stats && stats.topActions.length > 0 && (
        <View className='card'>
          <Text className='dash__section-title'>{t('actionDistribution')}</Text>
          {stats.topActions.map((a) => (
            <View key={a.action} className='flex-between dash__action'>
              <Text>{a.action}</Text>
              <Text className='dash__action-count'>{a.count}</Text>
            </View>
          ))}
        </View>
      )}

      <View className='card'>
        <Text className='dash__section-title'>{t('quickLinks')}</Text>
        <View className='dash__links'>
          {QUICK_LINKS.map((l) => (
            <View
              key={l.tab}
              className='dash__link'
              onClick={() => setActiveTab(l.tab)}
            >
              <Text>{quickLabel(l.tab)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

export default DashboardPage
