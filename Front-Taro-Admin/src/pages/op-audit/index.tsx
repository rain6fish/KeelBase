import { useEffect, useState } from 'react'
import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { adminService } from '../../services/admin-service'
import { useLocaleStore, t, tFeature } from '../../i18n'
import RangeFilter from '../../components/range-filter/index'
import { downloadCsv } from '../../utils/csv'
import type { OperationAuditLog } from '../../types/admin'
import './index.scss'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function OpAuditPage() {
  const { locale } = useLocaleStore()
  const [items, setItems] = useState<OperationAuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState('')
  const [range, setRange] = useState('all')
  const [since, setSince] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const limit = 20

  const fetch = async (nextPage = 1) => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const res = await adminService.getOperationAuditLogs(nextPage, limit, userId.trim() || undefined, since)
      setItems(res.items)
      setTotal(res.total)
      setPage(res.page)
    } catch (err: any) {
      setErrorMessage(err?.message || t('loadOpAuditFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleRangeChange = (key: string, s?: string) => {
    setRange(key)
    setSince(s)
    fetch(1)
  }

  const handleExport = () => {
    downloadCsv(
      t('opAuditTitle'),
      [t('timeCol'), t('userCol'), t('methodCol'), t('featureCol'), t('pathCol'), t('statusCol')],
      items.map((l) => [formatTime(l.createdAt), l.username ?? l.userId ?? '-', l.method, tFeature(l.featureKey, l.featureFallback), l.path, l.statusCode ?? '']),
    )
    Taro.showToast({ title: t('exportDone'), icon: 'success' })
  }

  useEffect(() => {
    fetch(1)
  }, [locale])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <View className='page'>
      <Text className='page__title'>{t('opAuditTitle')}</Text>

      <View className='opaudit__toolbar'>
        <RangeFilter value={range} onChange={handleRangeChange} />
        <Input
          className='opaudit__filter'
          placeholder={t('filterByUserId')}
          value={userId}
          onInput={(e) => setUserId(e.detail.value)}
          onConfirm={() => fetch(1)}
        />
        <Button className='opaudit__filter-btn' size='mini' onClick={() => fetch(1)}>{t('filter')}</Button>
        <Button size='mini' onClick={() => { setUserId(''); setRange('all'); setSince(undefined); fetch(1) }}>{t('reset')}</Button>
        <Button size='mini' onClick={handleExport}>{t('export')}</Button>
      </View>

      {errorMessage && (
        <View className='opaudit__error'><Text>{errorMessage}</Text></View>
      )}

      <View className='card opaudit__table'>
        <View className='opaudit__row opaudit__row--header'>
          <Text className='opaudit__col-time'>{t('timeCol')}</Text>
          <Text className='opaudit__col-user'>{t('userCol')}</Text>
          <Text className='opaudit__col-method'>{t('methodCol')}</Text>
          <Text className='opaudit__col-feature'>{t('featureCol')}</Text>
          <Text className='opaudit__col-path'>{t('pathCol')}</Text>
          <Text className='opaudit__col-status'>{t('statusCol')}</Text>
        </View>

        {items.map((log) => (
          <View key={log.id}>
            <View className='opaudit__row' onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
              <Text className='opaudit__col-time'>{formatTime(log.createdAt)}</Text>
              <Text className='opaudit__col-user'>{log.username ?? log.userId ?? '-'}</Text>
              <Text className='opaudit__col-method'>{log.method}</Text>
              <Text className='opaudit__col-feature'>{tFeature(log.featureKey, log.featureFallback)}</Text>
              <Text className='opaudit__col-path'>{log.path}</Text>
              <Text className='opaudit__col-status'>
                <Text className={`opaudit__status ${log.statusCode && log.statusCode >= 400 ? 'error' : 'ok'}`}>
                  {log.statusCode ?? '-'}
                </Text>
              </Text>
            </View>
            {expanded === log.id && (
              <View className='opaudit__detail'>
                <Text className='opaudit__detail-label'>IP：{log.ip ?? '-'}　UA：{log.userAgent ?? '-'}</Text>
                {log.requestBody && (
                  <Text className='opaudit__detail-body'>{log.requestBody}</Text>
                )}
              </View>
            )}
          </View>
        ))}

        {!loading && items.length === 0 && (
          <View className='opaudit__empty'><Text>{t('noOpAudit')}</Text></View>
        )}
      </View>

      <View className='opaudit__pagination'>
        <Button size='mini' disabled={page <= 1} onClick={() => fetch(page - 1)}>{t('prevPage')}</Button>
        <Text className='opaudit__page-info'>{t('pageInfo', { page, pages: totalPages })}（{t('total', { n: total })}）</Text>
        <Button size='mini' disabled={page >= totalPages} onClick={() => fetch(page + 1)}>{t('nextPage')}</Button>
      </View>
    </View>
  )
}

export default OpAuditPage
