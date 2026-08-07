import { useEffect, useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAuditStore } from '../../stores/audit-store'
import { useLocaleStore, t } from '../../i18n'
import RangeFilter from '../../components/range-filter/index'
import { downloadCsv } from '../../utils/csv'
import './index.scss'

function formatTime(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function AuditPage() {
  const { logs, stats, loading, errorMessage, fetchLogs, fetchStats } = useAuditStore()
  const { locale } = useLocaleStore()
  const [userId, setUserId] = useState('')
  const [range, setRange] = useState('all')
  const [since, setSince] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    fetchLogs({ since })
    fetchStats()
  }, [fetchLogs, fetchStats, locale])

  const handleFilter = () => {
    fetchLogs({ userId: userId.trim() || undefined, limit: 50, since })
  }

  const handleRangeChange = (key: string, s?: string) => {
    setRange(key)
    setSince(s)
    fetchLogs({ userId: userId.trim() || undefined, limit: 50, since: s })
  }

  const handleExport = () => {
    downloadCsv(
      t('aiAuditTitle'),
      [t('timeCol'), t('userCol'), t('featureCol'), t('modelCol'), t('tokenCol'), t('statusCol')],
      logs.map((l) => [formatTime(l.createdAt), l.username ?? l.userId, l.action, `${l.provider ?? ''}/${l.model ?? ''}`, (l.promptTokens ?? 0) + (l.completionTokens ?? 0), l.isError ? t('error') : t('ok')]),
    )
    Taro.showToast({ title: t('exportDone'), icon: 'success' })
  }

  const statCards = [
    { label: t('conversations'), value: stats?.totalConversations ?? '-' },
    { label: t('messages'), value: stats?.totalMessages ?? '-' },
    { label: 'Token', value: stats?.totalTokens ?? '-' },
    { label: t('errors'), value: stats?.totalErrors ?? '-' },
  ]

  return (
      <View className='page'>
        <Text className='page__title'>{t('aiAuditTitle')}</Text>

        <View className='audit__stat-cards'>
          {statCards.map((s) => (
            <View key={s.label} className='card audit__stat-card'>
              <Text className='audit__stat-value'>{s.value}</Text>
              <Text className='audit__stat-label'>{s.label}</Text>
            </View>
          ))}
        </View>

        <View className='audit__toolbar'>
          <RangeFilter value={range} onChange={handleRangeChange} />
          <Input
            className='audit__filter'
            placeholder={t('filterByUser')}
            value={userId}
            onInput={(e) => setUserId(e.detail.value)}
            onConfirm={handleFilter}
          />
          <Button className='audit__filter-btn' size='mini' onClick={handleFilter}>
            {t('filter')}
          </Button>
          <Button size='mini' onClick={handleExport}>{t('export')}</Button>
        </View>

        {errorMessage && (
          <View className='audit__error'>
            <Text>{errorMessage}</Text>
          </View>
        )}

        <View className='card audit__table'>
          <View className='audit__row audit__row--header'>
            <Text className='audit__col-time'>{t('timeCol')}</Text>
            <Text className='audit__col-user'>{t('userCol')}</Text>
            <Text className='audit__col-action'>{t('featureCol')}</Text>
            <Text className='audit__col-provider'>{t('modelCol')}</Text>
            <Text className='audit__col-tokens'>{t('tokenCol')}</Text>
            <Text className='audit__col-status'>{t('statusCol')}</Text>
          </View>

          {logs.map((log) => (
            <View key={log.id}>
              <View className='audit__row' onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                <Text className='audit__col-time'>{formatTime(log.createdAt)}</Text>
                <Text className='audit__col-user'>{log.username ?? log.userId}</Text>
                <Text className='audit__col-action'>{log.action}</Text>
                <Text className='audit__col-provider'>
                  {t('providerModel', { provider: log.provider ?? '-', model: log.model ?? '-' })}
                </Text>
                <Text className='audit__col-tokens'>
                  {(log.promptTokens ?? 0) + (log.completionTokens ?? 0)}
                </Text>
                <View className='audit__col-status'>
                  <Text className={`audit__status ${log.isError ? 'error' : 'ok'}`}>
                    {log.isError ? t('error') : t('ok')}
                  </Text>
                </View>
              </View>
              {expanded === log.id && (
                <View className='audit__detail'>
                  {log.detail && <Text className='audit__detail-item'><Text className='audit__detail-label'>Detail：</Text>{log.detail}</Text>}
                  {log.errorMessage && <Text className='audit__detail-item'><Text className='audit__detail-label'>Error：</Text>{log.errorMessage}</Text>}
                  {log.durationMs != null && <Text className='audit__detail-item'><Text className='audit__detail-label'>Duration：</Text>{log.durationMs}ms</Text>}
                  {log.conversationId && <Text className='audit__detail-item'><Text className='audit__detail-label'>Conversation：</Text>{log.conversationId}</Text>}
                </View>
              )}
            </View>
          ))}

          {!loading && logs.length === 0 && (
            <View className='audit__empty'>
              <Text>{t('noAiAudit')}</Text>
            </View>
          )}
        </View>
      </View>
  )
}

export default AuditPage
